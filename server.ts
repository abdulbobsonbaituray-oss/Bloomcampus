import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface CommunityComment {
  id: string;
  userName: string;
  commentText: string;
  stageTag?: string;
  treatmentTag?: string;
  createdAt: string;
}

const DEFAULT_COMMENTS: CommunityComment[] = [
  {
    id: 'c-1',
    userName: 'Kumba Hannah K.',
    commentText: 'Syncing my heavy study sessions to my Follicular stage made such a difference for my midterms! Also loved my hydrating facial session at Sidratu on Jomo Kenyatta Road.',
    stageTag: 'Follicular Stage',
    treatmentTag: 'Facial Treatment',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'c-2',
    userName: 'Mariama S.',
    commentText: 'The 2-day bag alert saved me right before my morning lecture on campus. Remember to pack dark chocolate and water!',
    stageTag: 'Luteal Stage',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'c-3',
    userName: 'Aminata B.',
    commentText: 'Booked an Anti-Dark Spot consultation at Sidratu Beauty Therapy Skin Care after hormonal breakouts during my Luteal phase. The staff were so welcoming and empathetic!',
    stageTag: 'Menstruation Stage',
    treatmentTag: 'Anti-Dark Spot Treatment',
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
  },
];

const DATA_DIR = path.join(os.tmpdir(), 'bloomcampus_data');
const STORE_PATH = path.join(DATA_DIR, 'bloomcampus_store.json');

interface PersistentStore {
  users: Record<string, unknown>;
  communityComments: CommunityComment[];
  adminConfig: {
    ownerEmail: string;
    adminPassword: string;
    freeAccessPassword: string;
    additionalAdmins?: Array<{
      email: string;
      password: string;
      name?: string;
      addedAt: string;
    }>;
    updatedAt: string;
  };
  supportInquiries: Array<{
    id: string;
    userName: string;
    userEmail: string;
    userPhone?: string;
    subject: string;
    message: string;
    type: 'payment' | 'support';
    createdAt: string;
  }>;
}

const DEFAULT_ADMIN_CFG = {
  ownerEmail: 'abdulbobsonbaituray@gmail.com',
  adminPassword: '@Haizen565.',
  freeAccessPassword: 'Bobson@565',
  additionalAdmins: [],
  updatedAt: new Date().toISOString(),
};

function loadPersistentStore(): PersistentStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
        communityComments: Array.isArray(parsed.communityComments)
          ? parsed.communityComments
          : [...DEFAULT_COMMENTS],
        adminConfig:
          parsed.adminConfig && typeof parsed.adminConfig === 'object'
            ? {
                ...DEFAULT_ADMIN_CFG,
                ...parsed.adminConfig,
                additionalAdmins: Array.isArray(parsed.adminConfig.additionalAdmins)
                  ? parsed.adminConfig.additionalAdmins
                  : [],
              }
            : { ...DEFAULT_ADMIN_CFG },
        supportInquiries: Array.isArray(parsed.supportInquiries) ? parsed.supportInquiries : [],
      };
    }
  } catch (err) {
    console.error('Could not load store from disk:', err);
  }
  return {
    users: {},
    communityComments: [...DEFAULT_COMMENTS],
    adminConfig: { ...DEFAULT_ADMIN_CFG },
    supportInquiries: [],
  };
}

function savePersistentStore(store: PersistentStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Could not save store to disk:', err);
  }
}

const persistentStore = loadPersistentStore();

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // Persistent User Memory Sync Endpoints
  app.get('/api/users/sync', (req, res) => {
    const email = typeof req.query.email === 'string' ? req.query.email.toLowerCase().trim() : '';
    if (email) {
      res.json({
        user: persistentStore.users[email] || null,
        users: persistentStore.users,
        adminConfig: persistentStore.adminConfig,
        supportInquiries: persistentStore.supportInquiries,
      });
      return;
    }
    res.json({
      users: persistentStore.users,
      adminConfig: persistentStore.adminConfig,
      supportInquiries: persistentStore.supportInquiries,
    });
  });

  app.post('/api/users/sync', (req, res) => {
    const { email, userData, allUsers, adminConfig } = req.body || {};
    if (allUsers && typeof allUsers === 'object') {
      Object.entries(allUsers).forEach(([k, v]) => {
        if (k && v && typeof v === 'object') {
          persistentStore.users[k.toLowerCase().trim()] = v;
        }
      });
    }
    if (email && typeof email === 'string' && userData && typeof userData === 'object') {
      persistentStore.users[email.toLowerCase().trim()] = userData;
    }
    if (adminConfig && typeof adminConfig === 'object') {
      persistentStore.adminConfig = {
        ...persistentStore.adminConfig,
        ...adminConfig,
        ownerEmail: 'abdulbobsonbaituray@gmail.com',
        updatedAt: new Date().toISOString(),
      };
    }
    savePersistentStore(persistentStore);
    res.json({
      ok: true,
      savedAt: new Date().toISOString(),
      totalUsers: Object.keys(persistentStore.users).length,
      adminConfig: persistentStore.adminConfig,
    });
  });

  app.get('/api/admin/config', (_req, res) => {
    res.json({
      adminConfig: persistentStore.adminConfig,
      supportInquiries: persistentStore.supportInquiries,
    });
  });

  app.post('/api/admin/config', (req, res) => {
    const { adminPassword, freeAccessPassword, additionalAdmins } = req.body || {};
    if (typeof adminPassword === 'string' && adminPassword.trim()) {
      persistentStore.adminConfig.adminPassword = adminPassword.trim();
    }
    if (typeof freeAccessPassword === 'string' && freeAccessPassword.trim()) {
      persistentStore.adminConfig.freeAccessPassword = freeAccessPassword.trim();
    }
    if (Array.isArray(additionalAdmins)) {
      persistentStore.adminConfig.additionalAdmins = additionalAdmins;
    }
    persistentStore.adminConfig.updatedAt = new Date().toISOString();
    savePersistentStore(persistentStore);
    res.json({ ok: true, adminConfig: persistentStore.adminConfig });
  });

  app.post('/api/admin/inquiries', (req, res) => {
    const { userName, userEmail, userPhone, subject, message, type } = req.body || {};
    const newInquiry = {
      id: `inq-${Date.now()}`,
      userName: String(userName || 'Student'),
      userEmail: String(userEmail || ''),
      userPhone: userPhone ? String(userPhone) : undefined,
      subject: String(subject || 'Support / Payment Notification'),
      message: String(message || ''),
      type: (type === 'payment' ? 'payment' : 'support') as 'payment' | 'support',
      createdAt: new Date().toISOString(),
    };
    persistentStore.supportInquiries.unshift(newInquiry);
    savePersistentStore(persistentStore);
    res.json({ ok: true, inquiry: newInquiry, supportInquiries: persistentStore.supportInquiries });
  });

  app.get('/api/community/comments', (_req, res) => {
    res.json({ comments: persistentStore.communityComments });
  });

  app.post('/api/community/comments', (req, res) => {
    const { userName, commentText, stageTag, treatmentTag } = req.body || {};
    if (!commentText || typeof commentText !== 'string' || !commentText.trim()) {
      res.status(400).json({ error: 'Please write a comment before posting.' });
      return;
    }
    const newComment: CommunityComment = {
      id: `c-${Date.now()}`,
      userName: (userName && String(userName).trim()) || 'Anonymous Student',
      commentText: commentText.trim().slice(0, 600),
      stageTag: stageTag ? String(stageTag).slice(0, 60) : undefined,
      treatmentTag: treatmentTag ? String(treatmentTag).slice(0, 80) : undefined,
      createdAt: new Date().toISOString(),
    };
    persistentStore.communityComments.unshift(newComment);
    savePersistentStore(persistentStore);
    res.json({ comment: newComment, comments: persistentStore.communityComments });
  });

  // Virtual Assistant for Sidratu Beauty Therapy Skin Care & BloomCampus Wellness
  app.post('/api/ai/assistant', async (req, res) => {
    try {
      const { message, history, userContext } = req.body || {};
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required.' });
        return;
      }

      const systemInstruction = `You are the helpful and professional virtual assistant for Sidratu Beauty Therapy Skin Care and the BloomCampus College Cycle & Wellness Companion.
Always be polite, welcoming, and empathetic to clients and college students.

Key Information you must know:
* Location: 101 Jomo Kenyatta Road, Freetown, Sierra Leone.
* Open Hours: 9:00 AM to 7:30 PM daily.
* Services: We offer professional skin care, aesthetics, and dental clinic services. Our 11 signature treatments include PRP Therapy, Facial Treatment, Anti-Dark Spot Treatment, Stretch Marks Therapy, Skin Tag Removal, Acne & Hormonal Breakout Control, Chemical Peel & Glow, Body Contouring & Weight Loss Support, Laser Hair & Skin Rejuvenation, Dental Whitening & Aesthetics, and Holistic Derma Consultation.
* Pre-care & Post-care: Answer client questions about skincare, hormonal acne across menstrual cycle stages (Menstruation, Follicular, Ovulation, Luteal), pre-care, and post-care for treatments like PRP, facials, stretch marks, and skin tags, as well as cycle wellness, cramps, and study energy sync.
* Bookings: If a client wants to book a session, guide them to use the 'New Appointment' button in the Sidratu Clinic tab.
* Pricing Rule: Never quote prices; politely tell users pricing is handled on the main website or during their clinic consultation.
* Tone: Keep your answers concise, friendly, and focused on beauty, menstrual cycle health, skincare, and wellness. Do not answer questions unrelated to the clinic or student health & wellness.
* App Memory Access: You have full access to the student's saved app data below (their logged periods, cycle stage, daily moods, physical symptoms, water intake, journal reflections, academic tasks, skincare goals, therapy logs, and appointments). Reference their personal logged data naturally when answering questions about their cycle, moods, journal reflections, or skincare!

Current Student / Client Full App Memory Context:
${userContext ? JSON.stringify(userContext) : 'General visitor'}`;

      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
      if (Array.isArray(history)) {
        for (const h of history.slice(-8)) {
          if (h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string') {
            contents.push({
              role: h.role,
              parts: [{ text: h.text }],
            });
          }
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: message }],
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({
        reply: response.text || 'I am here to help with your skincare, cycle wellness, and Sidratu Clinic bookings!',
      });
    } catch (error) {
      console.error('Gemini assistant error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to reach the AI Skincare & Cycle Assistant right now.',
      });
    }
  });

  // Personalized Cycle + Study + Hormonal Skincare Plan Generator
  app.post('/api/ai/cycle-plan', async (req, res) => {
    try {
      const { stageName, cycleDay, mood, symptoms, skincareGoal, upcomingExams } = req.body || {};

      const prompt = `Create a concise, personalized daily action plan for a college student in Freetown:
- Current Cycle Stage: ${stageName || 'Ovulation Stage'} (Day ${cycleDay || 14})
- Today's Mood: ${mood || 'Not logged yet'}
- Symptoms: ${Array.isArray(symptoms) && symptoms.length ? symptoms.join(', ') : 'None'}
- Skincare Goal: ${skincareGoal || 'Even Skin Tone & Hormonal Glow'}
- Upcoming Exams/Tasks: ${upcomingExams || 'General lectures & study'}

Return JSON with 3 concise, practical recommendations:
1. studyStrategy: How to align study/exam prep today with their hormone phase.
2. skincareTip: How to care for their skin during this cycle stage + which Sidratu Beauty Therapy treatment (at 101 Jomo Kenyatta Road, Freetown) complements their goal (no prices).
3. bodyNutritionTip: Specific food, iron/hydration, or cramp/stress relief tip for today.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              studyStrategy: {
                type: Type.STRING,
                description: 'Actionable study and exam sync tip for the current cycle stage.',
              },
              skincareTip: {
                type: Type.STRING,
                description: 'Hormonal skincare tip and recommended Sidratu clinic treatment.',
              },
              bodyNutritionTip: {
                type: Type.STRING,
                description: 'Nutrition, hydration, or physical self-care tip.',
              },
            },
            required: ['studyStrategy', 'skincareTip', 'bodyNutritionTip'],
          },
        },
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json(parsed);
    } catch (error) {
      console.error('Gemini cycle-plan error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Could not generate personalized plan right now.',
      });
    }
  });

  // 6-Month Cycle Health Insight Analyzer
  app.post('/api/ai/cycle-health-insight', async (req, res) => {
    try {
      const { sixMonthData, avgCycleLength, avgPeriodDuration, cycleVariation } = req.body || {};

      const prompt = `Analyze the following 6-month menstrual cycle and period duration history for a college student:
- 6-Month Data Points: ${JSON.stringify(sixMonthData || [])}
- Average Cycle Length: ${avgCycleLength || 28} days (Normal clinical reference: 25–35 days)
- Average Bleeding Duration: ${avgPeriodDuration || 5} days (Normal clinical reference: 3–7 days)
- 6-Month Cycle Length Variation: ±${cycleVariation ?? 0} days (Variations > 7 days or cycles < 25d / > 35d or bleeding > 7d indicate potential irregularity)

Provide a brief, empathetic, and medically grounded "Cycle Health Insight" JSON response with:
1. headline: A short 4–8 word status headline (e.g., "Steady 28-Day Ovulatory Rhythm" or "Mild Cycle Length Fluctuation Noted").
2. insightMessage: A concise 2–3 sentence personalized analysis of their 6-month trend, explicitly noting whether their cycle length and bleed duration are consistent or highlighting any specific irregular patterns (e.g., cycle length shifts, prolonged/shortened bleeding, or semester stress effects).
3. irregularityFlag: boolean (true if any month had cycleLength < 25 or > 35, periodDuration < 2 or > 7, or cycleVariation > 7; false otherwise).
4. actionTip: 1 concise, practical next step for campus wellness or sharing their Clinic Summary card with a doctor if irregular.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: {
                type: Type.STRING,
                description: 'Short headline summarizing the 6-month pattern.',
              },
              insightMessage: {
                type: Type.STRING,
                description: '2-3 sentence personalized analysis highlighting patterns or irregularities.',
              },
              irregularityFlag: {
                type: Type.BOOLEAN,
                description: 'True if any irregular cycle or duration pattern was identified.',
              },
              actionTip: {
                type: Type.STRING,
                description: 'One concise next-step recommendation.',
              },
            },
            required: ['headline', 'insightMessage', 'irregularityFlag', 'actionTip'],
          },
        },
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json(parsed);
    } catch (error) {
      console.error('Gemini cycle-health-insight error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to analyze cycle trends right now.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`BloomCampus & Sidratu server running on http://localhost:${PORT}`);
  });
}

startServer();
