const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8787;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';

// Zod Schema for the Manifest
const FileSchema = z.object({
  path: z.string().refine(p => !p.includes('..') && !p.startsWith('/') && !p.startsWith('\\'), {
    message: "Path must be relative and cannot contain traversal or absolute routes"
  }),
  content: z.string().max(204800, "File content exceeds 200KB limit"),
  type: z.string()
});

const ManifestSchema = z.object({
  projectName: z.string(),
  unityVersionHint: z.string().default("2022.3.10f1"),
  folders: z.array(z.string()),
  files: z.array(FileSchema).max(250, "Project cannot exceed 250 files"),
  notes: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional()
});

const getPrompt = (name) => {
  try {
    return fs.readFileSync(path.join(__dirname, 'prompts', `${name}.txt`), 'utf8');
  } catch (e) {
    return "";
  }
};

async function callOllama(messages, model = 'qwen2.5-coder') {
  try {
    const response = await axios.post(OLLAMA_URL, {
      model,
      messages,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.2
      }
    });
    return JSON.parse(response.data.message.content);
  } catch (error) {
    console.error("Ollama Call Error:", error.message);
    throw new Error(error.code === 'ECONNREFUSED' ? "Ollama not running. Run 'ollama serve'." : "AI Generation failed.");
  }
}

app.post('/api/generate-manifest', async (req, res) => {
  const { config, model = 'qwen2.5-coder' } = req.body;

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = (step, reasoning = []) => {
    res.write(`data: ${JSON.stringify({ step, reasoning })}\n\n`);
  };

  try {
    const systemPrompt = getPrompt('system');

    // Phase 1: Interpret
    sendProgress("interpret", ["[SYSTEM] Phase 1: Interpreting Requirements...", `[AI] Project: ${config.projectName}`, `[AI] Genre: ${config.genre}`]);
    const interpretPrompt = getPrompt('interpret').replace('{config}', JSON.stringify(config));
    const interpretData = await callOllama([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: interpretPrompt }
    ], model);

    if (interpretData.reasoning) sendProgress("interpret", interpretData.reasoning);

    // Phase 2: Plan
    sendProgress("plan", ["[SYSTEM] Phase 2: Architectural Planning...", "[AI] Orchestrating design patterns and layers..."]);
    const planPrompt = getPrompt('plan').replace('{config}', JSON.stringify(interpretData.normalizedConfig));
    const planData = await callOllama([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: planPrompt }
    ], model);

    if (planData.reasoning) sendProgress("plan", planData.reasoning);

    // Phase 3: Manifest Generation
    sendProgress("manifest", ["[SYSTEM] Phase 3: Manifest Synthesis...", "[AI] Generating C# files and YAML assets..."]);
    const manifestPrompt = getPrompt('manifest').replace('{plan}', JSON.stringify(planData.architecturePlan));
    let manifestRaw = await callOllama([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: manifestPrompt }
    ], model);

    // Phase 4: Validation & Repair Loop
    sendProgress("validate", ["[SYSTEM] Phase 4: Validation & Quality Control...", "[AI] Verifying JSON schema and security constraints..."]);

    let result = ManifestSchema.safeParse(manifestRaw);
    let attempts = 0;

    while (!result.success && attempts < 2) {
      attempts++;
      sendProgress("repair", [`[SYSTEM] Attempt ${attempts}: Repairing Manifest...`, `[ERROR] ${result.error.errors[0].message}`]);

      const repairPrompt = getPrompt('repair')
        .replace('{errors}', JSON.stringify(result.error.errors))
        .replace('{manifest}', JSON.stringify(manifestRaw));

      manifestRaw = await callOllama([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: repairPrompt }
      ], model);

      result = ManifestSchema.safeParse(manifestRaw);
    }

    if (!result.success) {
      throw new Error("Failed to generate a valid manifest after 3 attempts.");
    }

    sendProgress("complete", ["[SUCCESS] AI Orchestration finished. Finalizing ZIP..."]);
    res.write(`data: ${JSON.stringify({ manifest: result.data })}\n\n`);
    res.end();

  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
