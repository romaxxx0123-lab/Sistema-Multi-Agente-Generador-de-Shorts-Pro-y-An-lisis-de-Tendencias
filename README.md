# Unity World Architect Pro v6.0

A high-fidelity project generator that produces ready-to-use Unity 2022.3.10f1+ projects with professional C# architecture and persistent asset linking.

## 🚀 Features

- **Hyper-Detailed Engine**: Generates complete Unity projects including `Assets`, `ProjectSettings`, `Packages`, `Plugins`, and `Docs`.
- **Professional Architecture**: Includes Event Bus, Service Locator, Singleton, State Machines, and Localization patterns.
- **GUID Persistence**: Every file and folder includes a corresponding `.meta` file to ensure Unity recognizes linked assets (Scripts on Prefabs, Materials on Meshes) immediately.
- **Enterprise Templates**: Select between `Simple`, `Enterprise`, and `UltimatePro` complexity levels to scaffold advanced systems like AI Behavior Trees and Custom Editor Tools.
- **URP & Input System Integration**: Pre-configured Universal Render Pipeline and New Input System assets.

## 🛠️ Built With

- **React 19**
- **TypeScript 5**
- **Tailwind CSS v4**
- **JSZip** & **File-Saver**
- **Framer Motion**

## 📦 Getting Started

1. Configure your project name and namespace.
2. Select the complexity level and desired feature toggles (URP, Input System, AsmDefs).
3. Click **"Desplegar Proyecto Hyper-Detallado"**.
4. Extract the generated ZIP and open the folder with **Unity Hub** (Unity 2022.3.10f1 or newer recommended).

## 🤖 AI Orchestrator (Ollama)

V1.0 introduces a multi-phase AI pipeline that "thinks" about your project architecture before generating files.

### 📋 Prerequisites
1. **Ollama**: Download and install from [ollama.com](https://ollama.com/).
2. **Download Model**: Run `ollama pull qwen2.5-coder` (recommended) or `ollama pull llama3.2`.
3. **Run Ollama**: Ensure the Ollama server is running (`ollama serve`).

### 🛠️ Local Setup
1. Clone the repository and run `npm install`.
2. Start the integrated environment: `npm run dev`.
   - Frontend: `http://localhost:5175`
   - Backend: `http://localhost:8787` (proxied via Vite)
3. Toggle **"Modo IA Real"** in the UI to enable AI generation.

### 🧠 How it Works
The AI follows a 4-phase pipeline:
1. **Interpretar**: Normalizes user requirements and detects missing information.
2. **Planear**: Decides on design patterns, folder structure, and architecture.
3. **Generar**: Synthesizes the final Unity manifest (C#, YAML, Folders).
4. **Validar y Reparar**: Automatically fixes the manifest if it doesn't meet the JSON schema.

---

Developed as a standalone architectural tool for Unity Developers.
