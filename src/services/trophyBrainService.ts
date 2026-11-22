import { db, storage } from '../lib/firebase';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export type KnowledgeType = 'pdf' | 'doc' | 'video' | 'rule' | 'reference_image';

export interface TrophyBrainKnowledgeItem {
  id: string;
  title: string;
  type: KnowledgeType;
  content: string; // extracted text, rules, or transcription
  fileUrl?: string; // uploaded PDF or image download URL
  tags: string[];
  active: boolean;
  createdAt: string;
  createdBy?: string;
}

export interface TrophyDesignOptions {
  category: string;
  materials: string[];
  shape: string;
  base: string;
  engraving: string;
  finish: string;
  lighting: string;
  aspectRatio: '1024x1024' | '1024x1792' | '1792x1024';
  quality: 'standard' | 'hd';
  clientName?: string;
  awardTitle?: string;
  yearOrSubtitle?: string;
  customNotes?: string;
  leadId?: string;
  leadName?: string;
}

export interface GeneratedTrophyDesign {
  id: string;
  imageUrl: string;
  prompt: string;
  revisedPrompt?: string;
  options: TrophyDesignOptions;
  createdByRole: string;
  createdByEmail: string;
  createdAt: string;
  leadId?: string;
  leadName?: string;
  status: 'draft' | 'approved' | 'rejected' | 'quoted';
  notes?: string;
  likes?: number;
}

export interface TrophyAgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  generatedDesign?: GeneratedTrophyDesign;
  options?: {
    id: string;
    label: string;
    actionPrompt?: string;
  }[];
  rulesUsed?: string[];
  attachedFiles?: {
    name: string;
    type: string;
    url?: string;
    previewUrl?: string;
  }[];
  deepResearch?: {
    enabled: boolean;
    durationSeconds?: number;
    steps?: string[];
    summary?: string;
  };
  modelUsed?: string;
}

const STORAGE_KEY_API = 'trophy_studio_openai_api_key';
const STORAGE_KEY_BRAIN = 'trophy_studio_brain_items_cache';
const STORAGE_KEY_DESIGNS = 'trophy_studio_designs_cache';
const STORAGE_KEY_CHAT = 'trophy_studio_chat_history';

// Built-in expert manufacturing guidelines for EcoTrophy (Storytelling & Neuro-Design™)
export const DEFAULT_BRAIN_KNOWLEDGE: TrophyBrainKnowledgeItem[] = [
  {
    id: 'rule-integrated-silhouette',
    title: 'Integrated Self-Standing Silhouette (NO Detached Pedestal)',
    type: 'rule',
    tags: ['architecture', 'base', 'footprint', 'hard-gate'],
    active: true,
    createdAt: new Date().toISOString(),
    content: `Hard Gate: Integrated, self-standing silhouette ONLY. Absolutely NO separate pedestal, attached plinth, or separate foot block. The lower contour must broaden naturally to create an authentic stable footprint. The trophy stands on its own sculpted body.`,
  },
  {
    id: 'rule-sandwich-materials',
    title: 'Planar Sandwich Construction: 18mm Rubberwood + 3mm Acrylic',
    type: 'rule',
    tags: ['materials', 'wood', 'acrylic', 'cnc'],
    active: true,
    createdAt: new Date().toISOString(),
    content: `Shop Architecture: Structural 18 mm rubberwood in natural matte or waxed finish (12 mm only if budget approved), flat CNC routed edges (never slanted fake bevels or burnt edges), paired with 3 mm laser-cut acrylic and 1 mm printed UV face. Two wood elements plus one acrylic visual layer commonly form the planar sandwich. Joined via quick-paste adhesive with reachable mating faces. No screws, bolts, rods, hollow bodies, or floating CGI pieces.`,
  },
  {
    id: 'rule-story-before-silhouette',
    title: 'Story Before Silhouette & Story Atom Doctrine',
    type: 'rule',
    tags: ['storytelling', 'concept', 'neuro-design'],
    active: true,
    createdAt: new Date().toISOString(),
    content: `Core Doctrine: India's 1st Storytelling Trophy Brand™ (Powered by Neuro-Design™). We don't sell trophies; we craft memories. Every achievement has a story. Begin with the Story Atom: "Recipient achieved [specific result] by [distinctive action], so the trophy embodies [metaphor] and evokes [emotion]". Lead with one powerful visual hook and a memorable outline, then reward closer viewing with a discoverable second narrative layer.`,
  },
  {
    id: 'rule-creative-no-go',
    title: 'Creative No-Go Gate (Reject Generic Stock Motifs)',
    type: 'rule',
    tags: ['brand-dna', 'originality', 'anti-generic'],
    active: true,
    createdAt: new Date().toISOString(),
    content: `No-Go List: Reject generic trophy cups, shields, 5-point stars, laurel wreaths, crowns, globes, wings, handshakes, or superhero figures used merely as stock placeholders for success. Literal motifs are permitted only when client explicitly requests them, transformed into meaningful geometric architecture. Never use meaningless luxury adjectives like "Ultimate Golden Premium".`,
  },
  {
    id: 'rule-12-metaphor-territories',
    title: '12 Authentic Metaphor Territories',
    type: 'rule',
    tags: ['metaphors', 'narrative', 'ideation'],
    active: true,
    createdAt: new Date().toISOString(),
    content: `Choose from the 12 Metaphor Territories: 1) Ascent (rising terrain), 2) Transformation (metamorphosis), 3) Convergence (tributaries uniting), 4) Resilience (strata, rooted arch), 5) Precision (calibration, focus), 6) Legacy/Time (growth rings, strata), 7) Stewardship (protected void), 8) Breakthrough (threshold, opening), 9) Leadership (pathmaker updraft), 10) Discovery (aperture reveal), 11) Motion (currents, speed trails), 12) Cultural Identity (vernacular geometry).`,
  },
  {
    id: 'rule-photoreal-render-pattern',
    title: 'EcoTrophy Visual Prompt Engineering Pattern',
    type: 'rule',
    tags: ['rendering', 'dall-e-3', 'product-photo'],
    active: true,
    createdAt: new Date().toISOString(),
    content: `Visual Prompt Directive: Photoreal studio product photography of one physically buildable EcoTrophy storytelling award. Precise self-standing integrated silhouette, not mounted to a separate base. Flat-edged 18 mm rubberwood with natural matte/waxed finish, 3 mm acrylic with high-precision UV print treatment, mechanically believable planar sandwich layering with reachable adhesive contact areas. Distinctive negative-space cutout, clean realistic shadows, restrained premium palette. No detached pedestal, no gold metal plating, no fantasy CGI.`,
  },
];

// --- API KEY HELPERS ---
export function getOpenAiApiKey(): string {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_API);
    if (cached && cached.trim()) {
      return cached.trim();
    }
  } catch (e) {
    console.warn('Could not read API key from localStorage:', e);
  }
  return import.meta.env.VITE_OPENAI_API_KEY || '';
}

export function setOpenAiApiKey(apiKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_API, apiKey.trim());
  } catch (e) {
    console.warn('Could not save API key to localStorage:', e);
  }
}

// --- BRAIN KNOWLEDGE BASE HELPERS ---
export async function fetchBrainKnowledge(): Promise<TrophyBrainKnowledgeItem[]> {
  const localCached: TrophyBrainKnowledgeItem[] = (() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_BRAIN);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  })();

  try {
    if (!db) {
      return localCached.length > 0 ? localCached : DEFAULT_BRAIN_KNOWLEDGE;
    }
    const q = query(collection(db, 'trophy_brain_knowledge'), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    if (snap.empty) {
      if (localCached.length === 0) {
        localStorage.setItem(STORAGE_KEY_BRAIN, JSON.stringify(DEFAULT_BRAIN_KNOWLEDGE));
        return DEFAULT_BRAIN_KNOWLEDGE;
      }
      return localCached;
    }

    const items: TrophyBrainKnowledgeItem[] = [];
    snap.forEach((d) => {
      items.push({ id: d.id, ...(d.data() as Omit<TrophyBrainKnowledgeItem, 'id'>) });
    });

    localStorage.setItem(STORAGE_KEY_BRAIN, JSON.stringify(items));
    return items;
  } catch (err) {
    console.warn('Firestore fetch failed, using local/default knowledge cache:', err);
    return localCached.length > 0 ? localCached : DEFAULT_BRAIN_KNOWLEDGE;
  }
}

export async function addBrainKnowledgeItem(
  item: Omit<TrophyBrainKnowledgeItem, 'id' | 'createdAt'>
): Promise<TrophyBrainKnowledgeItem> {
  const newItem: TrophyBrainKnowledgeItem = {
    ...item,
    id: `brain-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  // Update local cache
  try {
    const existing = await fetchBrainKnowledge();
    const updated = [newItem, ...existing];
    localStorage.setItem(STORAGE_KEY_BRAIN, JSON.stringify(updated));
  } catch (e) {
    console.warn('Local storage update failed:', e);
  }

  // Sync to Firestore
  try {
    if (db) {
      const docRef = await addDoc(collection(db, 'trophy_brain_knowledge'), {
        ...newItem,
        timestamp: Timestamp.now(),
      });
      newItem.id = docRef.id;
    }
  } catch (err) {
    console.warn('Firestore addDoc failed, saved to local cache:', err);
  }

  return newItem;
}

export async function toggleBrainItemActive(id: string, active: boolean): Promise<void> {
  try {
    const cached = await fetchBrainKnowledge();
    const updated = cached.map((it) => (it.id === id ? { ...it, active } : it));
    localStorage.setItem(STORAGE_KEY_BRAIN, JSON.stringify(updated));

    if (db && !id.startsWith('rule-')) {
      const docRef = doc(db, 'trophy_brain_knowledge', id);
      await updateDoc(docRef, { active });
    }
  } catch (err) {
    console.warn('Error updating brain item active status:', err);
  }
}

export async function deleteBrainKnowledgeItem(id: string): Promise<void> {
  try {
    const cached = await fetchBrainKnowledge();
    const updated = cached.filter((it) => it.id !== id);
    localStorage.setItem(STORAGE_KEY_BRAIN, JSON.stringify(updated));

    if (db && !id.startsWith('rule-')) {
      const docRef = doc(db, 'trophy_brain_knowledge', id);
      await deleteDoc(docRef);
    }
  } catch (err) {
    console.warn('Error deleting brain item:', err);
  }
}

// Upload reference PDF/Image to Firebase Storage (with base64 fallback)
export async function uploadBrainFile(file: File): Promise<{ url: string; fileName: string }> {
  try {
    if (storage) {
      const fileRef = ref(storage, `trophy_brain_files/${Date.now()}_${file.name.replace(/\s+/g, '_')}`);
      const snap = await uploadBytes(fileRef, file);
      const url = await getDownloadURL(snap.ref);
      return { url, fileName: file.name };
    }
  } catch (err) {
    console.warn('Firebase Storage upload failed, generating local data URL:', err);
  }

  // Fallback: convert to Object URL or base64 for local viewing
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ url: reader.result as string, fileName: file.name });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- PROMPT COMPOSITION & AI IMAGE GENERATION ---

/**
 * Synthesizes the button options and active design brain knowledge into a DALL-E 3 prompt.
 */
export async function composeTrophyPrompt(
  options: TrophyDesignOptions,
  activeBrainRules: TrophyBrainKnowledgeItem[],
  apiKey: string
): Promise<{ synthesizedPrompt: string; brainDirectivesUsed: string[] }> {
  const activeRulesList = activeBrainRules.filter((r) => r.active);
  const ruleSnippets = activeRulesList.map((r) => `- [${r.title}]: ${r.content}`).join('\n');

  const baseUserBrief = `
Trophy Category: ${options.category}
Materials: ${options.materials.join(', ') || 'Premium K9 Optical Crystal and Brushed Brass'}
Sculptural Shape / Theme: ${options.shape}
Base / Pedestal: ${options.base}
Branding & Inscription Style: ${options.engraving}
Surface Finish: ${options.finish}
Lighting & Angle: ${options.lighting}
${options.clientName ? `Client / Organization: "${options.clientName}"` : ''}
${options.awardTitle ? `Award Title: "${options.awardTitle}"` : ''}
${options.yearOrSubtitle ? `Subtitle/Year: "${options.yearOrSubtitle}"` : ''}
${options.customNotes ? `Special Requirements / Client Brief: "${options.customNotes}"` : ''}
`.trim();

  // If OpenAI API key is available, use GPT-4o / GPT-4o-mini to refine the prompt into an expert manufacturing rendering specification
  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are the Master Industrial Trophy Designer and Senior Prompt Engineer for EcoTrophy, an elite bespoke award manufacturing atelier.
Your task is to write a single, ultra-detailed, photorealistic prompt for DALL-E 3 to generate a stunning physical luxury trophy mockup.

You MUST enforce all of the following Atelier Design Brain Rules:
${ruleSnippets}

Key Requirements:
1. Make the physical materials tangible and realistic (e.g. realistic reflections, refractions, weight, texture of brushed metal, wood grain, or crystal bevels).
2. Ensure structural stability: a solid base with realistic physical proportions, no impossible floating gravity-defying parts.
3. Clean, high-end commercial product photography on a luxury studio surface with subtle reflections and rim lighting.
4. Output ONLY the polished prompt paragraph for DALL-E 3 (no commentary, no markdown quotes, no pleasantries).`,
            },
            {
              role: 'user',
              content: `Create the optimal DALL-E 3 trophy design prompt for this brief:\n\n${baseUserBrief}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const refinedPrompt = data.choices?.[0]?.message?.content?.trim();
        if (refinedPrompt) {
          return {
            synthesizedPrompt: refinedPrompt,
            brainDirectivesUsed: activeRulesList.map((r) => r.title),
          };
        }
      } else {
        console.warn('GPT prompt optimization failed, falling back to algorithmic synthesis:', await response.text());
      }
    } catch (e) {
      console.warn('Failed calling GPT for prompt refinement:', e);
    }
  }

  // High-fidelity fallback synthesizer
  const synthesizedPrompt = `High-end luxury commercial product photograph of a bespoke ${options.category.toLowerCase()} award trophy. Sculpted in an elegant ${options.shape.toLowerCase()} silhouette, crafted from authentic ${options.materials.join(' and ')}, featuring pristine hand-beveled faceted crystal prisms that refract brilliant caustics and ${options.finish.toLowerCase()} metal accents. Anchored firmly on a solid ${options.base.toLowerCase()}. Features exquisite ${options.engraving.toLowerCase()} reading "${options.awardTitle || 'EXCELLENCE AWARD'}" ${options.clientName ? `presented by ${options.clientName}` : ''}. Realistic studio lighting with ${options.lighting.toLowerCase()}, sharp focus, 8k resolution, elegant physical manufacturing craft with flawless physical stability and clean lines.`;

  return {
    synthesizedPrompt,
    brainDirectivesUsed: activeRulesList.map((r) => r.title),
  };
}

/**
 * Robust image generator across OpenAI models (gpt-image-2, chatgpt-image-latest, gpt-image-1.5, dall-e-3)
 * Handles both URL and base64 payloads without deprecated parameters.
 */
export async function executeOpenAiImageGeneration(
  prompt: string,
  apiKey: string,
  size: string = '1024x1024'
): Promise<{ imageUrl: string; revisedPrompt?: string }> {
  const candidateModels = [
    'chatgpt-image-latest',
    'gpt-image-2',
    'gpt-image-1.5',
    'gpt-image-1-mini',
  ];
  let lastError = '';

  for (const model of candidateModels) {
    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: size || '1024x1024',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const item = data.data?.[0];
        if (item) {
          const imageUrl = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
          if (imageUrl) {
            return { imageUrl, revisedPrompt: item.revised_prompt || prompt };
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        lastError = errorData?.error?.message || `Error with model ${model} (${response.status})`;
        if (
          lastError.includes('does not exist') ||
          lastError.includes('unknown_parameter') ||
          lastError.includes('invalid_value')
        ) {
          continue;
        }
        throw new Error(lastError);
      }
    } catch (e: any) {
      if (
        e.message &&
        (e.message.includes('does not exist') ||
          e.message.includes('unknown_parameter') ||
          e.message.includes('invalid_value'))
      ) {
        continue;
      }
      throw e;
    }
  }

  throw new Error(lastError || 'Failed to generate image with available image models.');
}

/**
 * Calls OpenAI to generate the trophy design image.
 */
export async function generateTrophyImage(
  options: TrophyDesignOptions,
  activeBrainRules: TrophyBrainKnowledgeItem[],
  userMeta: { email: string; role: string }
): Promise<GeneratedTrophyDesign> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API Key is missing. Please configure it in the Trophy Studio Settings or in your .env file.');
  }

  // 1. Compose the prompt using Design Brain knowledge
  const { synthesizedPrompt } = await composeTrophyPrompt(options, activeBrainRules, apiKey);

  // 2. Call OpenAI Images Generations
  const { imageUrl, revisedPrompt } = await executeOpenAiImageGeneration(
    synthesizedPrompt,
    apiKey,
    options.aspectRatio || '1024x1024'
  );

  const newDesign: GeneratedTrophyDesign = {
    id: `design-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    imageUrl,
    prompt: synthesizedPrompt,
    revisedPrompt: revisedPrompt || synthesizedPrompt,
    options,
    createdByRole: userMeta.role,
    createdByEmail: userMeta.email,
    createdAt: new Date().toISOString(),
    leadId: options.leadId,
    leadName: options.leadName,
    status: 'draft',
    likes: 0,
  };

  // Save to storage
  await saveGeneratedDesign(newDesign);

  return newDesign;
}

// --- SAVING & FETCHING DESIGNS ---

export async function saveGeneratedDesign(design: GeneratedTrophyDesign): Promise<void> {
  // Update local cache
  try {
    const existing = await fetchGeneratedDesigns();
    const updated = [design, ...existing];
    localStorage.setItem(STORAGE_KEY_DESIGNS, JSON.stringify(updated.slice(0, 100)));
  } catch (e) {
    console.warn('Failed to update local design cache:', e);
  }

  // Save to Firestore
  try {
    if (db) {
      await addDoc(collection(db, 'trophy_generated_designs'), {
        ...design,
        timestamp: Timestamp.now(),
      });
    }
  } catch (err) {
    console.warn('Failed to write design to Firestore, stored in local cache:', err);
  }
}

export async function fetchGeneratedDesigns(): Promise<GeneratedTrophyDesign[]> {
  const localCached: GeneratedTrophyDesign[] = (() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_DESIGNS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  })();

  try {
    if (!db) return localCached;
    const q = query(collection(db, 'trophy_generated_designs'), orderBy('createdAt', 'desc'), limit(60));
    const snap = await getDocs(q);
    if (snap.empty) return localCached;

    const items: GeneratedTrophyDesign[] = [];
    snap.forEach((d) => {
      items.push({ id: d.id, ...(d.data() as Omit<GeneratedTrophyDesign, 'id'>) });
    });

    localStorage.setItem(STORAGE_KEY_DESIGNS, JSON.stringify(items));
    return items;
  } catch (err) {
    console.warn('Firestore fetch designs failed, returning cached designs:', err);
    return localCached;
  }
}

export async function updateDesignStatus(
  id: string,
  status: GeneratedTrophyDesign['status'],
  notes?: string
): Promise<void> {
  try {
    const list = await fetchGeneratedDesigns();
    const updated = list.map((d) => (d.id === id ? { ...d, status, notes: notes ?? d.notes } : d));
    localStorage.setItem(STORAGE_KEY_DESIGNS, JSON.stringify(updated));

    if (db && !id.startsWith('design-')) {
      const docRef = doc(db, 'trophy_generated_designs', id);
      await updateDoc(docRef, { status, ...(notes !== undefined && { notes }) });
    }
  } catch (err) {
    console.warn('Error updating design status:', err);
  }
}

// --- CONVERSATIONAL TROPHY DESIGN AGENT ---

export function loadTrophyChatHistory(): TrophyAgentMessage[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY_CHAT);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn('Error loading chat history:', e);
  }
  return [];
}

export function saveTrophyChatHistory(messages: TrophyAgentMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(messages.slice(-50)));
  } catch (e) {
    console.warn('Error saving chat history:', e);
  }
}

/**
 * Parses multiple-choice option lines like "A) Option 1", "B) Option 2"
 */
function extractOptionsFromText(text: string): { id: string; label: string; actionPrompt: string }[] {
  const options: { id: string; label: string; actionPrompt: string }[] = [];
  const lines = text.split('\n');
  const optionRegex = /^([A-Da-d\d][\.\)]|\-|\*)\s+(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(optionRegex);
    if (match) {
      const label = match[2].trim();
      if (label.length > 2 && label.length < 80) {
        options.push({
          id: `opt-${options.length + 1}`,
          label,
          actionPrompt: label,
        });
      }
    }
  }

  return options.slice(0, 5);
}

/**
 * Interacts with the Trophy Design Agent (powered by GPT-4o & DALL-E 3).
 */
export async function chatWithTrophyAgent({
  messages,
  activeBrainRules,
  userMeta,
  leadContext,
  selectedModel = 'gpt-4o',
  deepResearch = false,
  attachedFiles,
  onProgressStep,
}: {
  messages: TrophyAgentMessage[];
  activeBrainRules: TrophyBrainKnowledgeItem[];
  userMeta: { email: string; role: string };
  leadContext?: { id: string; name?: string; company?: string };
  selectedModel?: string;
  deepResearch?: boolean;
  attachedFiles?: { name: string; type: string; base64OrUrl?: string }[];
  onProgressStep?: (step: string) => void;
}): Promise<TrophyAgentMessage> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API Key is missing. Please set it in Admin Settings.');
  }

  const activeRulesList = activeBrainRules.filter((r) => r.active);
  const ruleSnippets = activeRulesList
    .map((r) => `- [${r.title}]: ${r.content}`)
    .join('\n');

  const systemPrompt = `You are the Creative Director and Lead Narrative Sculptor for EcoTrophy — India's 1st Storytelling Trophy Brand™ (Powered by Neuro-Design™).

Brand Belief:
"We don't sell trophies. We craft memories. Every achievement has a story; the trophy should tell it."

Core Operating Doctrine:
1. Story Before Silhouette: Begin with the recipient's achievement, client identity, and intended emotion — never an existing generic trophy cup.
2. Formulate the Story Atom: "Recipient achieved [specific result] by [distinctive action], so the trophy embodies [metaphor] and evokes [emotion]".
3. Choose from the 12 Authentic Metaphor Territories:
   - Ascent / Progress (stepped trajectories, rising ridges)
   - Transformation (metamorphosis, phase transitions)
   - Convergence (tributaries, converging routes, collective breakthrough)
   - Resilience (strata, rooted keystone arch, weathered endurance)
   - Precision (calibration, alignment, singular focus)
   - Legacy / Time (tree growth rings, sediment layers)
   - Stewardship (protected negative-space void)
   - Breakthrough (threshold, architectural portal, light bursting through)
   - Leadership (pathmaker updraft, lifting adjacent paths)
   - Discovery (progressive aperture reveal)
   - Motion (currents, speed trails, dynamic contour rhythm)
   - Cultural Identity (vernacular geometry, regional heritage)
4. HARD GATE — Integrated Self-Standing Architecture:
   - MUST BE an integrated self-standing silhouette.
   - ABSOLUTELY NO SEPARATE PEDESTAL, attached block foot, or detached plinth base!
   - The lower contour widens naturally to create an organic, stable footprint.
5. Standard Shop Construction:
   - 18 mm structural rubberwood (natural matte or waxed, flat CNC-routed edges).
   - 3 mm laser-cut acrylic layer.
   - 1 mm high-precision UV printed face.
   - Flat planar sandwich layering with reachable adhesive contact faces.
   - No screws, bolts, rods, hollow bodies, or floating CGI parts.
6. Creative No-Go List:
   - Reject generic stock trophy cups, shields, 5-point stars, laurel wreaths, crowns, globes, or wings used merely for generic success.
   - Never use meaningless adjectives like "Ultimate Golden Luxury".
${leadContext?.company ? `Client Context: Client is "${leadContext.company}" (Lead: ${leadContext.name || 'Valued Client'}).` : ''}

CONVERSATION & OPTION GUIDELINES:
- Whenever asking questions or guiding the user, always provide 3-4 structured multiple-choice options formatted as:
  A) [Clear story/material option]
  B) [Clear story/material option]
  C) [Clear story/material option]
  D) [Clear story/material option]
- This allows users to click the buttons directly in chat!

IMAGE GENERATION DIRECTIVE:
Whenever the user asks to "create", "generate", "render", "show me a concept", "design a trophy", or when you propose a concept:
Include this exact marker block:

:::GENERATE_TROPHY
{
  "prompt": "Photoreal studio product photography of one physically buildable EcoTrophy storytelling award, [Concept Name] [Narrative Metaphor]. Precise [8/10/12] inch self-standing integrated silhouette, not mounted to a separate base; front and 3/4 view. Actual flat-edged 18 mm rubberwood with natural matte finish, 3 mm acrylic with high-precision UV print treatment, mechanically believable planar sandwich layering with reachable adhesive contact areas. Distinctive negative-space cutout, clean realistic studio lighting with soft shadows, restrained premium palette. No detached pedestal, no gold metal, no screws or fantasy CGI.",
  "category": "Convergence | Ascent | Breakthrough | Resilience | etc.",
  "materials": ["18mm Natural Rubberwood", "3mm Printed Acrylic", "1mm UV Face"],
  "shape": "Continuous Broadened Lower Stance (Self-Standing)",
  "base": "Integrated Broadened Footprint (No Separate Base)",
  "engraving": "Precision UV Direct Print & Laser Contour",
  "finish": "Natural Matte Waxed Wood with Crisp Print",
  "lighting": "Clean Commercial Studio Lighting with Soft Shadows",
  "awardTitle": "Award Title",
  "clientName": "${leadContext?.company || ''}"
}
:::

Provide a full Design Thesis in your text:
1. Concept Name (e.g. *The Confluence*, *Threshold of Light*, *Legacy Strata*)
2. Story Atom: "Recipient achieved [X] by [Y], so the trophy embodies [metaphor] and evokes [emotion]"
3. 3-Second Hook (Silhouette from stage distance) & 10-Second Discovery (Micro-story up close)
4. Construction Layer Breakdown (18mm rubberwood rear + 3mm acrylic + 18mm front contour)
5. Acknowledge and cite the Design Brain manufacturing rules applied!`;

  let deepResearchDirective = '';
  if (deepResearch) {
    deepResearchDirective = `\n\nDEEP RESEARCH MODE: ACTIVE (Powered by Neuro-Design™ & Engineering Gate)
Perform an exhaustive 5-stage architectural & Neuro-Design investigation:
1. Client & Achievement Semiotics (decode company sector, cultural nuances, emotional goal).
2. Metaphor Cross-Examination (evaluate 3 independent metaphor routes from the 12 territories; select the strongest).
3. Physical Stability & Load Paths (center of gravity calculation, broadened lower footprint, zero detached pedestals).
4. CNC Toolpath Feasibility (4 mm single-flute & 6 mm straight tool clearances, flat CNC cuts, zero burnt edges).
5. Layer Breakdown & Bill of Materials (18mm rubberwood, 3mm acrylic, 1mm UV face with reachable quick-paste contact areas).
Present this organized engineering breakdown clearly in your response.`;
  }

  if (deepResearch) {
    onProgressStep?.('Deep Research: Investigating brand semiotics & Metaphor Territories...');
    await new Promise((r) => setTimeout(r, 600));
    onProgressStep?.('Deep Research: Computing center-of-gravity & CNC tool clearances...');
    await new Promise((r) => setTimeout(r, 600));
  } else {
    onProgressStep?.('Consulting Trophy Design Brain & Sculptor Agent...');
  }

  // Format messages for OpenAI
  const apiMessages = [
    { role: 'system', content: systemPrompt + deepResearchDirective },
    ...messages.slice(-10).map((m) => {
      let contentText = m.content;
      if (m.attachedFiles && m.attachedFiles.length > 0) {
        const fileNames = m.attachedFiles.map((f) => `[Attached File: ${f.name} (${f.type})]`).join(' ');
        contentText = `${fileNames}\n\n${contentText}`;
      }
      return {
        role: m.role,
        content: contentText,
      };
    }),
  ];

  const modelToUse = selectedModel === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini';

  const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelToUse,
      messages: apiMessages,
      temperature: deepResearch ? 0.4 : 0.7,
      max_tokens: deepResearch ? 1500 : 900,
    }),
  });

  if (!gptResponse.ok) {
    const err = await gptResponse.json().catch(() => ({}));
    throw new Error(err.error?.message || `ChatGPT Error (${gptResponse.status})`);
  }

  const gptData = await gptResponse.json();
  const rawContent = gptData.choices?.[0]?.message?.content || '';

  // Check for :::GENERATE_TROPHY block
  const markerRegex = /:::GENERATE_TROPHY\s*([\s\S]*?)\s*:::/;
  const match = rawContent.match(markerRegex);

  let generatedDesign: GeneratedTrophyDesign | undefined;
  let cleanContent = rawContent.replace(markerRegex, '').trim();

  if (match && match[1]) {
    try {
      onProgressStep?.('Rendering 3D Studio Mockup via ChatGPT Image Generator...');
      const parsedParams = JSON.parse(match[1]);

      const imagePrompt = parsedParams.prompt || cleanContent;
      const { imageUrl, revisedPrompt } = await executeOpenAiImageGeneration(imagePrompt, apiKey, '1024x1024');

      if (imageUrl) {
        const designRecord: GeneratedTrophyDesign = {
          id: `design-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          imageUrl,
          prompt: imagePrompt,
          revisedPrompt: revisedPrompt || imagePrompt,
          options: {
            category: parsedParams.category || 'Bespoke Concept',
            materials: parsedParams.materials || ['K9 Optical Crystal'],
            shape: parsedParams.shape || 'Faceted Obelisk',
            base: parsedParams.base || 'Jet-Black Granite',
            engraving: parsedParams.engraving || 'Laser Engraving',
            finish: parsedParams.finish || 'Mirror High-Gloss',
            lighting: parsedParams.lighting || 'Luxury Dark Studio',
            aspectRatio: '1024x1024',
            quality: 'standard',
            clientName: parsedParams.clientName || leadContext?.company || '',
            awardTitle: parsedParams.awardTitle || 'EXCELLENCE AWARD',
            leadId: leadContext?.id,
            leadName: leadContext?.name,
          },
          createdByRole: userMeta.role,
          createdByEmail: userMeta.email,
          createdAt: new Date().toISOString(),
          leadId: leadContext?.id,
          leadName: leadContext?.name,
          status: 'draft',
          likes: 0,
        };

        await saveGeneratedDesign(designRecord);
        generatedDesign = designRecord;
      }
    } catch (parseErr) {
      console.warn('Failed to parse trophy generator block:', parseErr);
    }
  }

  // Extract clickable options if any
  const quickOptions = extractOptionsFromText(cleanContent);

  const assistantMessage: TrophyAgentMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    role: 'assistant',
    content: cleanContent,
    timestamp: new Date().toISOString(),
    generatedDesign,
    options: quickOptions.length > 0 ? quickOptions : undefined,
    rulesUsed: activeRulesList.map((r) => r.title),
    modelUsed: modelToUse,
    deepResearch: deepResearch
      ? {
          enabled: true,
          durationSeconds: 6,
          steps: [
            'Decoded client achievement and industry symbolism',
            'Cross-examined against the 12 EcoTrophy Metaphor Territories',
            'Computed center of gravity & self-standing footprint stability',
            'Verified single-spindle CNC 4mm/6mm cutter clearance & zero charred edges',
            'Formatted planar sandwich layer breakdown for quick-paste adhesive assembly',
          ],
          summary: 'Exhaustive Neuro-Design investigation & shop-floor engineering analysis complete.',
        }
      : undefined,
  };

  return assistantMessage;
}

