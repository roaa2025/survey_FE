import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { registerChatRoutes } from "./replit_integrations/chat"; // Using chat for rephrase/logic if needed
import OpenAI from "openai";

let openai: OpenAI | null = null;

function initializeOpenAI() {
  // Check for both AI_INTEGRATIONS_OPENAI_API_KEY and OPENAI_API_KEY
  // This allows users to use either environment variable name
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  
  // Debug: Log if API key is found (without exposing the full key)
  if (apiKey) {
    console.log("✅ OpenAI API key found:", apiKey.substring(0, 10) + "...");
  } else {
    console.warn(
      "⚠️  AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY is not set. AI features will be unavailable.",
    );
    // Debug: Show what environment variables are available
    console.log("   Available env vars:", Object.keys(process.env).filter(k => k.includes("OPENAI") || k.includes("AI")).join(", ") || "none");
    return;
  }

  try {
    openai = new OpenAI({
      apiKey: apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    console.log("✅ OpenAI client initialized successfully");
  } catch (error) {
    console.warn("⚠️  Failed to initialize OpenAI client:", error);
  }
}

// Don't initialize at module load time - wait until registerRoutes is called
// This ensures dotenv has loaded the environment variables first

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize OpenAI now that dotenv has loaded environment variables
  initializeOpenAI();
  
  // Register AI chat routes (optional but good for history/logging)
  registerChatRoutes(app);

  // === Survey Endpoints ===
  
  app.get(api.surveys.list.path, async (req, res) => {
    const surveys = await storage.getSurveys();
    res.json(surveys);
  });

  app.get(api.surveys.get.path, async (req, res) => {
    const survey = await storage.getSurvey(Number(req.params.id));
    if (!survey) {
      return res.status(404).json({ message: 'Survey not found' });
    }
    res.json(survey);
  });

  app.post(api.surveys.create.path, async (req, res) => {
    try {
      const input = api.surveys.create.input.parse(req.body);
      const survey = await storage.createSurvey(input);
      res.status(201).json(survey);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.surveys.update.path, async (req, res) => {
    try {
      const input = api.surveys.update.input.parse(req.body);
      const survey = await storage.updateSurvey(Number(req.params.id), input);
      res.json(survey);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      // Handle case where survey is not found
      if (err instanceof Error && err.message.includes('not found')) {
        return res.status(404).json({ message: 'Survey not found' });
      }
      throw err;
    }
  });

  app.delete(api.surveys.delete.path, async (req, res) => {
    try {
      await storage.deleteSurvey(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      // Handle case where survey is not found
      if (err instanceof Error && err.message.includes('not found')) {
        return res.status(404).json({ message: 'Survey not found' });
      }
      throw err;
    }
  });

  // === AI Generation Endpoints ===
  
  // Test endpoint to verify route is registered
  console.log("✅ AI Generation endpoint registered at:", api.ai.generate.path);

  app.post(api.ai.generate.path, async (req, res) => {
    console.log("📥 Received AI generation request");
    try {
      const { prompt, numQuestions, numPages, language } = api.ai.generate.input.parse(req.body);
      console.log("📥 Request details:", { prompt: prompt?.substring(0, 50) + "...", numQuestions, numPages, language });

      // Construct a system prompt to guide the AI
      const systemPrompt = `You are an expert survey designer. 
      Generate a structured survey based on the user's request.
      Language: ${language}
      Target: ${numQuestions} questions across ${numPages} pages.
      
      Return ONLY valid JSON with this structure:
      {
        "suggestedName": "string",
        "sections": [
          {
            "title": "string",
            "questions": [
              {
                "text": "string",
                "type": "rating" | "text" | "choice",
                "options": ["string"] (only for choice type)
              }
            ]
          }
        ]
      }`;

      if (!openai) {
        return res.status(503).json({ message: "OpenAI is not configured" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("No content generated");

      const result = JSON.parse(content);
      res.json(result);

    } catch (err) {
      console.error("AI Generation Error:", err);
      // Provide more detailed error information
      const errorMessage = err instanceof Error ? err.message : String(err);
      const statusCode = err instanceof Error && 'status' in err ? (err as any).status : 500;
      res.status(statusCode).json({ 
        message: "Failed to generate survey structure",
        error: errorMessage 
      });
    }
  });

  app.post(api.ai.rephrase.path, async (req, res) => {
    try {
      const { prompt, language } = req.body;
      
      if (!openai) {
        return res.status(503).json({ message: "OpenAI is not configured" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: "You are a professional editor. Rephrase the following survey prompt to be more clear, professional, and effective. Return JSON with 'rephrased' field." },
          { role: "user", content: `Language: ${language}\nPrompt: ${prompt}` }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("No content generated");

      const result = JSON.parse(content);
      res.json({
        original: prompt,
        rephrased: result.rephrased || prompt // Fallback
      });

    } catch (err) {
      console.error("AI Rephrase Error:", err);
      // Provide more detailed error information
      const errorMessage = err instanceof Error ? err.message : String(err);
      const statusCode = err instanceof Error && 'status' in err ? (err as any).status : 500;
      res.status(statusCode).json({ 
        message: "Failed to rephrase prompt",
        error: errorMessage 
      });
    }
  });

  // === Seed Data ===
  try {
    await seedDatabase();
  } catch (error) {
    console.warn("⚠️  Could not seed database (database may not be configured):", error instanceof Error ? error.message : error);
  }

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getSurveys();
  if (existing.length === 0) {
    await storage.createSurvey({
      name: "Employee Satisfaction Q1",
      language: "English",
      collectionMode: "web",
      status: "active"
    });
    await storage.createSurvey({
      name: "Customer Feedback 2024",
      language: "Bilingual",
      collectionMode: "field",
      status: "draft"
    });
  }
}
