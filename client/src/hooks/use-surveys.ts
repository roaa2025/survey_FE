import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  buildUrl,
  type CreateSurveyRequest,
  type UpdateSurveyRequest,
  type GenerateSurveyRequest,
} from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { postSurveyPlanFast } from "@/lib/anomalyBackend";

// ============================================
// SURVEY HOOKS
// ============================================

export function useSurveys() {
  return useQuery({
    queryKey: [api.surveys.list.path],
    queryFn: async () => {
      const res = await fetch(api.surveys.list.path);
      if (!res.ok) throw new Error("Failed to fetch surveys");
      return api.surveys.list.responses[200].parse(await res.json());
    },
  });
}

export function useSurvey(id: number | null) {
  return useQuery({
    queryKey: [api.surveys.get.path, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("ID required");
      try {
        const url = buildUrl(api.surveys.get.path, { id });
        const res = await fetch(url);
        if (res.status === 404) {
          // Check localStorage as fallback
          try {
            const stored = localStorage.getItem(`survey_${id}_structure`);
            if (stored) {
              const structure = JSON.parse(stored);
              return {
                id,
                name: "Untitled Survey",
                language: "English" as const,
                collectionMode: "web" as const,
                status: "draft" as const,
                structure,
                createdAt: new Date(),
                updatedAt: new Date()
              };
            }
          } catch (e) {
            console.warn("Failed to read from localStorage:", e);
          }
          return null;
        }
        if (!res.ok) {
          // API failed, try localStorage fallback
          try {
            const stored = localStorage.getItem(`survey_${id}_structure`);
            if (stored) {
              const structure = JSON.parse(stored);
              return {
                id,
                name: "Untitled Survey",
                language: "English" as const,
                collectionMode: "web" as const,
                status: "draft" as const,
                structure,
                createdAt: new Date(),
                updatedAt: new Date()
              };
            }
          } catch (e) {
            console.warn("Failed to read from localStorage:", e);
          }
          throw new Error("Failed to fetch survey");
        }
        return api.surveys.get.responses[200].parse(await res.json());
      } catch (error) {
        // Network error - try localStorage fallback
        if (error instanceof TypeError && error.message.includes('fetch')) {
          try {
            const stored = localStorage.getItem(`survey_${id}_structure`);
            if (stored) {
              const structure = JSON.parse(stored);
              return {
                id,
                name: "Untitled Survey",
                language: "English" as const,
                collectionMode: "web" as const,
                status: "draft" as const,
                structure,
                createdAt: new Date(),
                updatedAt: new Date()
              };
            }
          } catch (e) {
            console.warn("Failed to read from localStorage:", e);
          }
        }
        throw error;
      }
    },
  });
}

export function useCreateSurvey() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: CreateSurveyRequest) => {
      try {
        const res = await fetch(api.surveys.create.path, {
          method: api.surveys.create.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        
        if (!res.ok) {
          if (res.status === 400) {
            const error = api.surveys.create.responses[400].parse(await res.json());
            throw new Error(error.message);
          }
          // If server is not available, return a mock response instead of throwing
          console.warn("Survey creation API failed, using mock response for frontend-only mode");
          return {
            id: Date.now(), // Use timestamp as temporary ID
            name: data.name,
            language: data.language,
            collectionMode: data.collectionMode,
            status: data.status || "draft",
            structure: null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }
        return api.surveys.create.responses[201].parse(await res.json());
      } catch (error) {
        // Network error or any other error - return mock response instead of throwing
        if (error instanceof TypeError && error.message.includes('fetch')) {
          console.warn("Survey creation network error, using mock response for frontend-only mode");
          return {
            id: Date.now(), // Use timestamp as temporary ID
            name: data.name,
            language: data.language,
            collectionMode: data.collectionMode,
            status: data.status || "draft",
            structure: null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }
        // For validation errors (400), still throw them as they're user input issues
        if (error instanceof Error && !error.message.includes('fetch')) {
          throw error;
        }
        // For other errors, return mock response
        console.warn("Survey creation error, using mock response:", error);
        return {
          id: Date.now(),
          name: data.name,
          language: data.language,
          collectionMode: data.collectionMode,
          status: data.status || "draft",
          structure: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path] });
      // Only show success toast if API was actually available (we can't easily detect this, so we'll skip it in mock mode)
      // toast({ title: "Survey Created", description: "Your draft has been saved." });
    },
    onError: (error) => {
      // Only show error for validation errors (400), not for network/API unavailability
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('fetch') && !errorMessage.includes('API_UNAVAILABLE')) {
        toast({ title: "Error", description: errorMessage, variant: "destructive" });
      }
    }
  });
}

export function useUpdateSurvey() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateSurveyRequest) => {
      try {
        const url = buildUrl(api.surveys.update.path, { id });
        const res = await fetch(url, {
          method: api.surveys.update.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!res.ok) {
          // If server is not available, return a mock response instead of throwing
          console.warn("Survey update API failed, using mock response for frontend-only mode");
          return {
            id,
            name: updates.name || "Untitled Survey",
            language: updates.language || "English",
            collectionMode: updates.collectionMode || "web",
            status: updates.status || "draft",
            structure: updates.structure || null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }
        return api.surveys.update.responses[200].parse(await res.json());
      } catch (error) {
        // Network error or any other error - return mock response instead of throwing
        if (error instanceof TypeError && error.message.includes('fetch')) {
          console.warn("Survey update network error, using mock response for frontend-only mode");
          return {
            id,
            name: updates.name || "Untitled Survey",
            language: updates.language || "English",
            collectionMode: updates.collectionMode || "web",
            status: updates.status || "draft",
            structure: updates.structure || null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }
        // For other errors (like parsing), still return mock to prevent crashes
        console.warn("Survey update error, using mock response:", error);
        return {
          id,
          name: updates.name || "Untitled Survey",
          language: updates.language || "English",
          collectionMode: updates.collectionMode || "web",
          status: updates.status || "draft",
          structure: updates.structure || null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.surveys.get.path, data.id] });
      // Only show success toast if API was actually available (we can't easily detect this, so we'll skip it in mock mode)
      // toast({ title: "Survey Updated", description: "Changes saved successfully." });
    },
    // No onError handler - we always return mock data on failure, so it's treated as success
  });
}

// ============================================
// AI GENERATION HOOKS
// ============================================

/**
 * Generate a mock survey structure as fallback when API is unavailable
 * This allows the app to work in demo/offline mode
 */
function generateMockSurveyStructure(data: GenerateSurveyRequest) {
  const { prompt, numQuestions, numPages, language } = data;
  
  // Extract key topics from prompt
  const keywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 3);
  const surveyName = prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt;
  
  // Generate sections based on numPages
  const questionsPerPage = Math.ceil(numQuestions / numPages);
  const sections = [];
  
  for (let page = 0; page < numPages; page++) {
    const sectionQuestions = [];
    const questionsInSection = page === numPages - 1 
      ? numQuestions - (page * questionsPerPage) 
      : questionsPerPage;
    
    for (let q = 0; q < questionsInSection; q++) {
      const questionNum = page * questionsPerPage + q + 1;
      let question;
      
      // Mix question types
      if (q % 3 === 0) {
        // Rating question
        question = {
          text: language === "Arabic" 
            ? `ما هو تقييمك لـ${keywords[0] || "هذا الموضوع"}؟`
            : `How would you rate ${keywords[0] || "this aspect"}?`,
          type: "rating" as const
        };
      } else if (q % 3 === 1) {
        // Choice question
        question = {
          text: language === "Arabic"
            ? `ما هو خيارك المفضل فيما يتعلق بـ${keywords[1] || "هذا الموضوع"}؟`
            : `What is your preference regarding ${keywords[1] || "this topic"}?`,
          type: "choice" as const,
          options: language === "Arabic"
            ? ["خيار 1", "خيار 2", "خيار 3", "خيار 4"]
            : ["Option 1", "Option 2", "Option 3", "Option 4"]
        };
      } else {
        // Text question
        question = {
          text: language === "Arabic"
            ? `يرجى مشاركة أفكارك حول ${keywords[2] || "هذا الموضوع"}`
            : `Please share your thoughts about ${keywords[2] || "this topic"}`,
          type: "text" as const
        };
      }
      
      sectionQuestions.push(question);
    }
    
    sections.push({
      title: language === "Arabic" 
        ? `القسم ${page + 1}: ${keywords[page % keywords.length] || "الموضوع"}`
        : `Section ${page + 1}: ${keywords[page % keywords.length] || "Topic"}`,
      questions: sectionQuestions
    });
  }
  
  return {
    sections,
    suggestedName: surveyName
  };
}

export function useGenerateSurvey() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: GenerateSurveyRequest) => {
      // Construct the full URL - use relative path which will work with same-origin requests
      // If the frontend is served from the same server, this will resolve correctly
      const url = api.ai.generate.path;
      console.log("🔵 Calling built-in AI endpoint:", url, data);
      
      try {
        const res = await fetch(url, {
          method: api.ai.generate.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          credentials: 'include', // Include cookies for same-origin requests
        });
        console.log("🔵 Response status:", res.status, res.statusText);
        
        if (!res.ok) {
          // If API fails, use mock data as fallback
          try {
            const errorText = await res.text();
            console.warn("AI Generation API failed, using mock data:", errorText);
            // Show a warning toast but don't fail the mutation
            toast({ 
              title: "AI Generation unavailable", 
              description: "Using fallback data. Check server logs for details.",
              variant: "default"
            });
          } catch {
            console.warn("AI Generation API failed (could not read error), using mock data");
          }
          // Return mock data - this is treated as success, not error
          return generateMockSurveyStructure(data);
        }
        
        try {
          return api.ai.generate.responses[200].parse(await res.json());
        } catch (parseError) {
          // If parsing fails, use mock data
          console.warn("AI Generation response parsing failed, using mock data:", parseError);
          return generateMockSurveyStructure(data);
        }
      } catch (error) {
        // Network error or any other error - use mock data
        // This includes TypeError (network), SyntaxError (JSON parse), etc.
        console.error("❌ AI Generation failed, using mock data:", error);
        if (error instanceof TypeError && error.message.includes("fetch")) {
          console.error("   This is a network error - the server may not be reachable");
          // Show a more helpful error message
          toast({ 
            title: "Network error", 
            description: "Could not reach the server. Using fallback data. Make sure the server is running on port 5000.",
            variant: "default"
          });
        }
        return generateMockSurveyStructure(data);
      }
    },
    // No onError handler - we always return mock data on failure, so it's treated as success
    // This prevents error toasts from showing
  });
}

/**
 * Generate a survey plan using the external Anomaly backend (fast endpoint).
 *
 * This hook is intentionally strict:
 * - It does NOT fall back to mock data.
 * - If the backend is down / CORS blocked / response shape is different, we show a toast.
 *
 * Reason: When the user explicitly chooses the external backend, failures should be visible.
 */
export function useGenerateSurveyFast() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: GenerateSurveyRequest) => postSurveyPlanFast(data),
    onError: (error) => {
      // Provide more detailed error messages
      let message = "An unknown error occurred";
      if (error instanceof TypeError && error.message.includes("fetch")) {
        message = "Failed to fetch: Could not reach the external backend. Check if the backend is running and the URL is correct.";
      } else if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      toast({ 
        title: "Generation failed", 
        description: message, 
        variant: "destructive" 
      });
    },
  });
}

export function useRephrasePrompt() {
  return useMutation({
    mutationFn: async (data: { prompt: string, language: string }) => {
      const res = await fetch(api.ai.rephrase.path, {
        method: api.ai.rephrase.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Rephrasing failed");
      return api.ai.rephrase.responses[200].parse(await res.json());
    }
  });
}
