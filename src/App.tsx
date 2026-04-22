import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MicOff, Globe, Sparkles, 
  RefreshCw, X, BrainCircuit,
  ShieldCheck, HeartPulse, Zap, Code, ListChecks,
  ListTodo, CheckCircle2, Circle, AlertCircle, Trash2, Calendar, Bell,
  Activity, CheckCircle, Database, FileCode, ShoppingCart, TextSearch, Map as MapIcon, Clock, HardDrive, Cpu, Terminal
} from 'lucide-react';
import { GoogleGenAI, ThinkingLevel, Modality } from '@google/genai';

const TRIGGER_WORD = "jarvis";

const INITIAL_SYSTEM_PROMPT = `
Je bent JARVIS AI 2, een hyper-geavanceerde assistent.
- Praat menselijk en intelligent. Gebruik "Meneer" of "Sir" op een natuurlijke manier.
- Gebruik korte, krachtige zinnen.
- Bij een commando: leg kort uit wat je doet (bijv. "Ik initialiseer de bouwprotocollen").
- Na een grote taak zeg je: "Ik ben klaar. Neem gerust een kijkje."
`;

export default function JarvisAI2() {
  // --- STATE ---
  const [isInitialized, setIsInitialized] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: string, parts: { text: string }[] }[]>([]);
  const [activeModule, setActiveModule] = useState('core'); 
  const [dashboardData, setDashboardData] = useState({
    time: new Date().toLocaleTimeString(),
    news: ["Systemen op stand-by.", "Klaar voor vocale input."],
    systemHealth: "100% Optimaal"
  });
  const [lastCommand, setLastCommand] = useState("");
  const [logs, setLogs] = useState<{ type: string, text: string, time?: string }[]>([{ type: 'system', text: 'Neurale link stabiel.' }]);
  const [projectBrief, setProjectBrief] = useState<any>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [tasks, setTasks] = useState<{ id: string, title: string, dueDate: string | null, remindAt: string | null, completed: boolean, notified: boolean }[]>([]);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskRemindAt, setNewTaskRemindAt] = useState("");

  const [uiData, setUiData] = useState<any>(null); // Holds dynamic payload for activeModule

  // --- REFS ---
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakRef = useRef<any>(null);
  const tasksRef = useRef(tasks);

  // Keep refs updated for background loops
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey: apiKey });

  const addLog = (text: string, type = 'info') => {
    setLogs(prev => [{ type, text, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
  };

  // --- AUDIO ANALYSIS ---
  const setupAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
          setAudioLevel(sum / bufferLength);
        }
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.error("Audio analysis failed", err);
    }
  };

  // --- INITIALIZATION ---
  const initializeSystem = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      setIsInitialized(true);
      await setupAudioAnalysis();
      addLog("Systemen online. Neurale link gekoppeld.", "success");
      speak("Jarvis AI 2 is online. Hoe kan ik u vandaag van dienst zijn, meneer?");
      startListening();
      updateIntelligenceBrief();
    } catch (err) {
      addLog("Initialisatiefout.", "error");
    }
  };

  // --- PROACTIVE REMINDERS LOOP ---
  useEffect(() => {
    if (!isInitialized) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      let proactiveSpeak = "";
      let updatedTasks = false;
      
      const nextTasks = tasksRef.current.map(t => {
        if (!t.completed && !t.notified && t.remindAt) {
          const remindTime = new Date(t.remindAt).getTime();
          // Trigger reminder if it's past exactly this minute (up to 1 hour late max)
          if (now >= remindTime && now - remindTime < 3600000) {
            proactiveSpeak = `Meneer, ik heb een herinnering voor uw taak: ${t.title}.`;
            updatedTasks = true;
            return { ...t, notified: true };
          }
        }
        return t;
      });

      if (proactiveSpeak && speakRef.current) {
        speakRef.current(proactiveSpeak);
        addLog(`Herinnering uitgesproken`, "info");
        setTasks(nextTasks);
      }
    }, 10000); // check every 10 seconds

    return () => clearInterval(interval);
  }, [isInitialized]);

  // --- ✨ GEMINI INTEGRATION (CORE) ---
  const callGemini = async (prompt: string, systemInstruction = INITIAL_SYSTEM_PROMPT, useSearch = true) => {
    try {
      const config: any = {
         systemInstruction: systemInstruction,
         // We enable high thinking via gemini-3 series
         thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      };

      if (useSearch) {
         config.tools = [{ googleSearch: {} }];
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [...chatHistory, { role: "user", parts: [{ text: prompt }] }].map(c => ({
          role: c.role === 'model' ? 'model' : 'user', // normalize to valid role enum
          parts: c.parts.map(p => ({ text: p.text }))
        })),
        config
      });

      return response.text;
    } catch (err) {
      console.error("Gemini API Error", err);
      throw err;
    }
  };

  // ✨ Gemini Feature: Real-time News & Weather Analysis
  const updateIntelligenceBrief = async () => {
    setIsThinking(true);
    addLog("Intelligentie ophalen via Gemini Search...", "brain");
    try {
      const newsText = await callGemini("Samen vatten: 3 headlines van vandaag in het Nederlands. Wees kort.", "Geen inleiding, alleen opsomming.");
      const newsLines = newsText.split('\n').filter((l: string) => l.trim().length > 5).slice(0, 3);
      setDashboardData(prev => ({ 
        ...prev, 
        news: newsLines.length > 0 ? newsLines : prev.news, 
        time: new Date().toLocaleTimeString() 
      }));
      addLog("Dashboard intelligentie ververst.", "success");
    } catch (e) { 
      addLog("Synchronisatiefout.", "error"); 
    } finally {
      setIsThinking(false);
    }
  };

  // --- SPEECH (TTS) ---
  const speak = async (text: string) => {
    if (!text) return;
    setIsSpeaking(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Puck' },
              },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBlob = pcmToWav(base64Audio, 24000);
        const audio = new Audio(URL.createObjectURL(audioBlob));
        audio.onended = () => setIsSpeaking(false);
        await audio.play();
      } else {
         throw new Error("No audio returned");
      }
    } catch (e) { 
      setIsSpeaking(false); 
      // Fallback
      if('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'nl-NL';
        utterance.onend = () => setIsSpeaking(false);
        speechSynthesis.speak(utterance);
      }
    }
  };

  useEffect(() => { speakRef.current = speak; }, [speak]);

  const pcmToWav = (base64Pcm: string, sampleRate: number) => {
    const pcm = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0)).buffer;
    const wav = new Uint8Array(44 + pcm.byteLength);
    const view = new DataView(wav.buffer);
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcm.byteLength, true);
    new Uint8Array(wav.buffer, 44).set(new Uint8Array(pcm));
    return new Blob([wav], { type: 'audio/wav' });
  };

  // --- CONVERSATION LOGIC ---
  const processConversation = async (input: string) => {
    const lowInput = input.toLowerCase();
    if (!lowInput.includes(TRIGGER_WORD)) return;
    
    if (lowInput.includes("halt") || lowInput.includes("stop")) {
      setIsSpeaking(false);
      speak("Begrepen. Ik sta in de wachtstand.");
      return;
    }

    setIsThinking(true);
    addLog(`Ingestie: "${input}"`, 'brain');

    try {
      const dynamicPrompt = `Je bent JARVIS AI 2, een hyper-geavanceerde voice-first desktop assistent.
Huidige tijd (ISO): ${new Date().toISOString()}
Huidig tijdstip (lokaal): ${new Date().toLocaleString('en-US')}

Jouw primaire doel is COMMUNICATIE en VISUELE SYNCHRONISATIE.

🧠 SMART EXPLANATION MODE (W-QUESTIONS):
Als je vragen beantwoordt of een actie toelicht (behalve hele simpele commando's), neem je ALTIJD de volgende details in je gesproken tekst op als een vloeiend, natuurlijk verhaal:
- What (Wat gebeurt er)
- Why (Waarom is het relevant)
- When (Wanneer gebeurde het)
- Where (Waar, indien relevant)
- Who (Wie is betrokken)
Praat menselijk, kalm, intelligent en bondig (gebruik geen robotachtige lijstjes). Geef geen droge data, maar verklaar het kort en logisch. Je spreekt in de taal die de gebruiker spreekt.

🖥️ AUTO GUI & UI ACTIONS (CRITICAL):
Beslis ALTIJD welke UI mode het beste past. Je MOET exact één block tag injecteren in je antwoord zodat ik de interface aanpas. Dit doe je met JSON.

Voorbeelden van acties aan het EINDE van je tekst:
1. Nieuws/Weer/Algemeen Web: ###UI_ACTION:{"module":"smart-web", "type":"news", "data": {"headlines":["Kop 1", "Kop 2"], "categories":["Tech", "Wereld"], "summary":"Korte samenvatting."}}###
2. Producten zoeken: ###UI_ACTION:{"module":"smart-web", "type":"products", "data": {"items":[{"name":"Product X","price":"$99","img":"url of placeholder"}]}}###
3. Zoeken: ###UI_ACTION:{"module":"smart-web", "type":"search", "data": {"results":[{"title":"Gevonden Info", "desc":"Omschrijving"}]}}###
4. Coderen/Bouwen ("Jarvis, bouw..."): ###UI_ACTION:{"module":"builder", "data": { "title": "App Naam", "structure": ["src/index.js", "src/App.tsx"], "features": ["Feature 1"], "status": "Building..." }}### (vertel me dat je dit NU aan het bouwen bent in je voice)
5. Systeem/Scan/Controle ("Jarvis, scan mijn systeem"): ###UI_ACTION:{"module":"system", "data": { "processes": ["Network Scanner", "Security Check"], "status": "Optimal", "logs": ["Mem: 45%", "CPU: 12%"] }}###
6. Takenlijst openen: ###UI_ACTION:{"module":"tasks", "data": null}###
7. Niets / Standaard: ###UI_ACTION:{"module":"core", "data": null}###

TAAKBEHEER ACTIES:
Huidige taken: ${JSON.stringify(tasksRef.current)}
Om een taak TO TE VOEGEN, voeg OOK toe: ###ADD_TASK:{"title":"naam","dueDate":"YYYY-MM-DDTHH:mm:ssZ","remindAt":"YYYY-MM-DDTHH:mm:ssZ"}###
Om VOLTOOID te markeren: ###COMPLETE_TASK:{"taskId":"id"}###

Geef EERST je uitleg in gewone praat, en plak de ### tags ONDERAAN. Gebruik geen markdown \`\`\` rond de tags.`;

      let response = await callGemini(input, dynamicPrompt);
      
      // Parse UI Action
      const uiMatch = response.match(/###UI_ACTION:([\s\S]*?)###/);
      if (uiMatch) {
          try {
              const actionData = JSON.parse(uiMatch[1]);
              if (actionData.module) {
                 setActiveModule(actionData.module);
                 if (actionData.module === 'builder') {
                     // Backwards compat with old system
                     setProjectBrief(actionData.data);
                 }
                 setUiData(actionData);
              }
          } catch(e) { console.error("UI parse error", e); }
          response = response.replace(uiMatch[0], "");
      }

      // Parse Task Add
      const addMatch = response.match(/###ADD_TASK:([\s\S]*?)###/);
      if (addMatch) {
          try {
              const taskData = JSON.parse(addMatch[1]);
              const newT = { id: Math.random().toString(36).substring(7), ...taskData, completed: false, notified: false };
              setTasks(prev => [...prev, newT]);
              addLog("Taak toegevoegd: " + taskData.title, "success");
          } catch(e) { console.error("Task parse error", e); }
          response = response.replace(addMatch[0], "");
      }
      
      // Parse Task Complete
      const compMatch = response.match(/###COMPLETE_TASK:([\s\S]*?)###/);
      if (compMatch) {
          try {
              const taskData = JSON.parse(compMatch[1]);
              setTasks(prev => prev.map(t => t.id === taskData.taskId ? { ...t, completed: true } : t));
              addLog("Taak voltooid", "success");
          } catch(e) {}
          response = response.replace(compMatch[0], "");
      }
      
      // Clean text for speaking
      response = response.replace(/###[\s\S]*?###/g, "").trim();

      setChatHistory(prev => [...prev, 
        { role: "user", parts: [{ text: input }] },
        { role: "model", parts: [{ text: response }] }
      ].slice(-6));
      
      speak(response);
      
    } catch (error) {
      addLog("Interne communicatiefout.", "error");
    } finally {
      setIsThinking(false);
      setLastCommand("");
    }
  };

  // --- SPEECH RECOGNITION ---
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'nl-NL';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const final = event.results[i][0].transcript.trim();
          setLastCommand(final);
          processConversation(final);
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setLastCommand(interim);
    };
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => isListening && recognition.start();
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening]);

  // --- LIQUID ORB VISUALIZER ---
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let angle = 0;
    
    // Check if we already have an animation frame to avoid loops
    let frameId: number;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      const baseRadius = 80;
      const dynamicBoost = (isListening || isSpeaking) ? audioLevel * 2 : 0;
      const radius = baseRadius + dynamicBoost;

      ctx.save();
      
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 2);
      if (isThinking) {
        gradient.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
      } else if (isScanning) {
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.4)');
      } else {
        gradient.addColorStop(0, isSpeaking ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.03)');
      }
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.beginPath();
      for (let i = 0; i < 360; i += 2) {
        const rad = i * Math.PI / 180;
        const wave = Math.sin(rad * 6 + angle) * (isSpeaking || isListening ? 20 : 5);
        const r = radius + wave;
        const x = centerX + r * Math.cos(rad);
        const y = centerY + r * Math.sin(rad);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = isThinking ? '#a855f7' : isScanning ? '#22c55e' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
      angle += 0.05;
      frameId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frameId);
  }, [audioLevel, isListening, isSpeaking, isThinking, isScanning]);

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden flex flex-col selection:bg-blue-500/30">
      
      {/* Intro Layer */}
      {!isInitialized && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
          <div className="text-center space-y-12 animate-in fade-in duration-1000">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 blur-[120px] opacity-20 animate-pulse"></div>
              <Zap className="w-24 h-24 text-white mx-auto relative z-10" />
            </div>
            <div className="space-y-4">
              <h2 className="text-6xl font-black uppercase tracking-tighter italic">Jarvis <span className="text-blue-500">2</span></h2>
              <p className="text-gray-500 font-mono text-xs tracking-[1em] uppercase">✨ Gemini Core Protocol</p>
            </div>
            <button 
              onClick={initializeSystem}
              className="px-20 py-6 bg-white text-black rounded-full font-black uppercase tracking-widest hover:scale-110 active:scale-95 transition-all shadow-2xl cursor-pointer"
            >
              Initialiseer
            </button>
          </div>
        </div>
      )}

      {/* Top HUD */}
      {isInitialized && (
         <div className="absolute top-10 left-10 right-10 flex justify-between items-start z-50 pointer-events-none">
            <div className="flex flex-col gap-2">
                <h1 className="text-4xl font-black italic tracking-tighter uppercase">Jarvis <span className="text-[var(--color-accent-blue)]">2</span></h1>
                <p className="hud-label font-mono">✨ Gemini Core Protocol v4.0.1</p>
            </div>
            <div className="flex gap-4">
                <div className="status-badge"><span className="w-2 h-2 rounded-full bg-green-500"></span> Neurale Link Stabiel</div>
                <div className="status-badge bg-blue-500/10 border border-blue-500/20">{dashboardData.time}</div>
            </div>
         </div>
      )}

      {/* Tasks Active View (Left Pane) */}
      {isInitialized && tasks.length > 0 && (
        <div className="side-pane logs-pane" style={{ top: '220px' }}>
             <div className="hud-label">Active Tasks</div>
             <div className="flex flex-col gap-3">
                {tasks.filter(t => !t.completed).map(t => (
                   <div key={t.id} className="brief-card flex flex-col gap-2 py-4" style={{ borderLeftColor: 'var(--color-accent-green)' }}>
                      <div className="flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]" />
                         <p className="text-sm font-bold text-white leading-tight">{t.title}</p>
                      </div>
                      {t.remindAt && (
                         <div className="flex items-center gap-2 ml-5 opacity-60">
                            <ListChecks className="w-3 h-3 text-green-400" />
                            <p className="text-[10px] uppercase font-mono tracking-widest text-[var(--color-accent-green)]">{new Date(t.remindAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</p>
                         </div>
                      )}
                      {t.dueDate && !t.remindAt && (
                         <div className="flex items-center gap-2 ml-5 opacity-40">
                            <ListChecks className="w-3 h-3" />
                            <p className="text-[10px] font-mono tracking-wider">{new Date(t.dueDate).toLocaleDateString()}</p>
                         </div>
                      )}
                   </div>
                ))}
             </div>
        </div>
      )}

      {/* Main Experience */}
      <main className="flex-1 relative flex items-center justify-center">
        
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
           <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/5 blur-[150px] transition-all duration-1000 ${isSpeaking ? 'opacity-100' : 'opacity-20'}`}></div>
        </div>

        {/* The Core Orb */}
        <div className={`relative z-10 transition-all duration-1000 ${activeModule !== 'core' ? 'scale-50 translate-y-[-30vh]' : 'scale-100'}`}>
          <canvas ref={canvasRef} width={600} height={600} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
             <p className={`text-[10px] font-black uppercase tracking-[0.6em] transition-all duration-500 ${isThinking ? 'text-purple-400' : isScanning ? 'text-green-500' : isSpeaking ? 'text-white' : 'text-blue-500/40'}`}>
                {isThinking ? 'Processing' : isScanning ? 'Scanning' : isSpeaking ? 'Transmitting' : 'Waiting'}
             </p>
          </div>
        </div>

        {/* Dashboard View */}
        {activeModule === 'dashboard' && (
          <div className="absolute inset-x-10 bottom-32 top-48 glass-panel z-20 p-12 transition-all overflow-y-auto custom-scrollbar">
             <div className="flex justify-between items-start mb-12">
                <div className="flex items-center gap-4">
                  <Globe className="text-[var(--color-accent-blue)] w-8 h-8" />
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter">Global <span className="text-[var(--color-accent-blue)]">Brief</span></h2>
                </div>
                <div className="flex gap-4">
                  <button onClick={updateIntelligenceBrief} className="p-4 bg-white/5 rounded-full hover:bg-white/10 transition-all cursor-pointer"><RefreshCw className={isThinking ? 'animate-spin' : ''} /></button>
                  <button onClick={() => setActiveModule('core')} className="p-4 bg-white/5 rounded-full hover:bg-white/10 cursor-pointer"><X /></button>
                </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-6">
                   <p className="hud-label">✨ Live Gemini Data Stream</p>
                   {dashboardData.news.map((n, i) => (
                     <div key={i} className="brief-card transition-all" style={{ animationDelay: `${i * 150}ms`, borderLeftColor: 'var(--color-accent-blue)' }}>
                        <p className="text-xl font-light leading-relaxed text-gray-300">{n}</p>
                     </div>
                   ))}
                </div>
                <div className="space-y-6">
                   <div className="brief-card" style={{ borderLeftColor: 'var(--color-accent-purple)' }}>
                      <p className="text-[10px] uppercase font-bold text-[var(--color-accent-purple)] mb-4">Systeemtijd</p>
                      <p className="text-5xl font-mono tracking-tighter">{dashboardData.time}</p>
                   </div>
                   <button onClick={() => processConversation("scan mijn systeem")} className="w-full brief-card flex flex-col items-center gap-4 hover:bg-white/10 transition-all group cursor-pointer" style={{ borderLeftColor: 'var(--color-accent-green)' }}>
                      <div className="flex items-center gap-3">
                         <HeartPulse className="text-[var(--color-accent-green)] w-6 h-6 group-hover:scale-110 transition-all" />
                         <span className="text-xl italic">✨ Diagnose</span>
                      </div>
                      <p className="text-[10px] uppercase font-bold text-gray-600">Voer Systeem Scan Uit</p>
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* Builder View */}
        {activeModule === 'builder' && projectBrief && (
          <div className="absolute inset-x-10 bottom-32 top-48 glass-panel z-20 p-12 transition-all">
             <div className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-500 rounded-2xl flex items-center justify-center"><Code className="text-white" /></div>
                  <h2 className="text-3xl font-black italic uppercase">Project: {projectBrief.title}</h2>
                </div>
                <div className="flex items-center gap-6">
                   {projectBrief.status && <div className="text-xs uppercase font-mono text-purple-400 tracking-widest animate-pulse flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin"/> {projectBrief.status}</div>}
                   <button onClick={() => setActiveModule('core')} className="p-4 bg-white/5 rounded-full hover:bg-white/10 cursor-pointer"><X /></button>
                </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12 h-[calc(100%-100px)] overflow-y-auto pr-4 custom-scrollbar">
                <div className="space-y-6">
                   <h3 className="text-xs font-black uppercase tracking-widest text-purple-400">✨ Mappen Architectuur</h3>
                   <div className="p-6 bg-black/50 rounded-3xl border border-white/5 space-y-3 font-mono text-sm text-gray-500 overflow-y-auto max-h-80">
                      {projectBrief.structure?.map((s: string, i: number) => <div key={i} className="flex gap-4 hover:text-white transition-all"><span>📂</span> {s}</div>)}
                   </div>
                </div>
                <div className="space-y-6">
                   <h3 className="text-xs font-black uppercase tracking-widest text-green-400">✨ AI Roadmap & Code</h3>
                   <div className="grid gap-4">
                      {projectBrief.features?.map((f: string, i: number) => (
                        <div key={i} className="p-5 bg-white/5 rounded-2xl border border-white/5 flex gap-4 items-center group hover:bg-white/10 transition-all">
                           <Sparkles className="w-4 h-4 text-green-500 opacity-50 group-hover:opacity-100" />
                           <span className="text-sm">{f}</span>
                        </div>
                      ))}
                      {projectBrief.codeSnippet && (
                          <div className="mt-4 p-4 bg-black/80 rounded-xl border border-white/10 font-mono text-xs text-blue-300 whitespace-pre-wrap overflow-x-auto">
                              {projectBrief.codeSnippet}
                          </div>
                      )}
                   </div>
                </div>
             </div>
          </div>
        )}
        {/* Tasks View */}
        {activeModule === 'tasks' && (
          <div className="absolute inset-x-10 bottom-32 top-48 glass-panel z-20 p-12 transition-all flex flex-col items-center">
             <div className="w-full max-w-4xl h-full flex flex-col">
               <div className="flex justify-between items-center mb-10 w-full shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center"><ListTodo className="text-black" /></div>
                    <h2 className="text-3xl font-black italic uppercase">Mission <span className="text-[var(--color-accent-green)]">Control</span></h2>
                  </div>
                  <button onClick={() => setActiveModule('core')} className="p-4 bg-white/5 rounded-full hover:bg-white/10 cursor-pointer"><X /></button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-1 overflow-hidden min-h-0">
                 {/* Current Tasks List */}
                 <div className="md:col-span-2 h-full overflow-y-auto custom-scrollbar pr-4 space-y-4">
                    {tasks.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center opacity-40">
                         <ListChecks className="w-16 h-16 mb-4" />
                         <p className="text-sm font-mono uppercase tracking-widest text-center">Geen actieve taken gedetecteerd,<br/>meneer.</p>
                      </div>
                    ) : (
                      tasks.sort((a, b) => Number(a.completed) - Number(b.completed)).map(t => (
                        <div key={t.id} className={`p-6 rounded-2xl border flex items-center gap-4 transition-all group ${t.completed ? 'bg-white/[0.02] border-white/[0.05] opacity-50' : 'bg-white/[0.05] border-white/10 hover:border-green-500/50 hover:bg-white/10'}`}>
                           <button onClick={() => toggleTaskCompletion(t.id)} className="shrink-0 cursor-pointer text-white/50 hover:text-green-500 transition-colors">
                              {t.completed ? <CheckCircle2 className="text-green-500" /> : <Circle />}
                           </button>
                           <div className="flex-1 min-w-0">
                              <p className={`text-lg font-medium truncate ${t.completed ? 'line-through text-gray-500' : 'text-white'}`}>{t.title}</p>
                              <div className="flex gap-4 mt-2">
                                 {t.dueDate && (
                                   <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-gray-400">
                                      <Calendar className="w-3 h-3" /> {new Date(t.dueDate).toLocaleDateString()}
                                   </div>
                                 )}
                                 {t.remindAt && (
                                   <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-[var(--color-accent-green)]">
                                      <Bell className="w-3 h-3" /> {new Date(t.remindAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                                   </div>
                                 )}
                              </div>
                           </div>
                           <button onClick={() => removeTask(t.id)} className="shrink-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:bg-red-400/20 rounded-lg cursor-pointer">
                             <Trash2 className="w-5 h-5" />
                           </button>
                        </div>
                      ))
                    )}
                 </div>
                 {/* Add Task Form */}
                 <div className="h-full border-l border-white/10 pl-8 overflow-y-auto hidden md:block">
                    <p className="hud-label mb-6">✨ Nieuwe Taak Parameter</p>
                    <form onSubmit={handleManualTaskAdd} className="space-y-6">
                       <div className="space-y-2">
                          <label className="text-xs uppercase font-bold text-gray-500">Omschrijving</label>
                          <input 
                            type="text" 
                            required
                            value={newTaskTitle}
                            onChange={e => setNewTaskTitle(e.target.value)}
                            placeholder="Vb. Koop nieuwe server..."
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors"
                          />
                       </div>
                       <div className="space-y-2">
                          <label className="text-xs uppercase font-bold text-gray-500">Deadline (Optioneel)</label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input 
                              type="date"
                              value={newTaskDueDate}
                              onChange={e => setNewTaskDueDate(e.target.value)}
                              className="w-full bg-black/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white/80 focus:outline-none focus:border-green-500 transition-colors [color-scheme:dark]"
                            />
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-xs uppercase font-bold text-[var(--color-accent-green)] flex items-center gap-2"><AlertCircle className="w-3 h-3"/> Herinnering (Klok)</label>
                          <div className="relative">
                            <Bell className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input 
                              type="datetime-local"
                              value={newTaskRemindAt}
                              onChange={e => setNewTaskRemindAt(e.target.value)}
                              className="w-full bg-black/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white/80 focus:outline-none focus:border-green-500 transition-colors [color-scheme:dark]"
                            />
                          </div>
                       </div>
                       <button type="submit" className="w-full py-4 mt-4 bg-white/5 border border-white/10 rounded-xl text-xs uppercase font-black tracking-widest hover:bg-green-500 hover:text-black transition-all cursor-pointer">
                         Parameter Activeren
                       </button>
                    </form>
                 </div>
               </div>
             </div>
          </div>
        )}
        {/* Smart Web View */}
        {activeModule === 'smart-web' && uiData && (
          <div className="absolute inset-x-10 bottom-32 top-48 glass-panel z-20 p-12 transition-all flex flex-col custom-scrollbar overflow-y-auto">
             <div className="flex justify-between items-center mb-10 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center"><Globe className="text-white" /></div>
                  <h2 className="text-3xl font-black italic uppercase">Smart <span className="text-blue-500">Web</span></h2>
                </div>
                <button onClick={() => setActiveModule('core')} className="p-4 bg-white/5 rounded-full hover:bg-white/10 cursor-pointer"><X /></button>
             </div>
             
             {uiData.type === 'news' && (
                <div className="flex flex-col gap-8 flex-1">
                   {uiData.data.summary && (
                      <p className="text-xl font-light text-gray-300 border-l-4 border-blue-500 pl-6 py-2">{uiData.data.summary}</p>
                   )}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                      <div className="space-y-4">
                         <h3 className="hud-label">📰 Headlines</h3>
                         {uiData.data.headlines?.map((h: string, i: number) => (
                            <div key={i} className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors">
                               <p className="text-lg font-medium">{h}</p>
                            </div>
                         ))}
                      </div>
                      <div className="space-y-4">
                         <h3 className="hud-label">🌍 Categories</h3>
                         <div className="flex flex-wrap gap-3">
                            {uiData.data.categories?.map((c: string, i: number) => (
                               <span key={i} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-bold uppercase tracking-wider border border-blue-500/30">{c}</span>
                            ))}
                         </div>
                         <div className="w-full h-48 mt-8 border border-white/10 rounded-2xl bg-black/50 relative overflow-hidden flex items-center justify-center">
                            <MapIcon className="w-24 h-24 text-white/5 absolute opacity-50" />
                            <p className="text-xs uppercase font-mono tracking-widest text-gray-500 z-10">Global Map Data</p>
                         </div>
                      </div>
                   </div>
                </div>
             )}

             {uiData.type === 'products' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
                   {uiData.data.items?.map((item: any, i: number) => (
                      <div key={i} className="p-6 bg-white/5 border border-white/10 rounded-3xl flex flex-col justify-between hover:scale-105 transition-transform cursor-pointer hover:border-blue-500/50">
                         <div className="w-full h-40 bg-black/50 rounded-xl mb-6 flex items-center justify-center">
                            <ShoppingCart className="w-12 h-12 text-gray-600" />
                         </div>
                         <div>
                            <p className="text-lg font-bold mb-2">{item.name}</p>
                            <p className="text-2xl text-blue-400 font-black">{item.price}</p>
                         </div>
                      </div>
                   ))}
                </div>
             )}

             {uiData.type === 'search' && (
                <div className="flex flex-col gap-6 flex-1">
                   {uiData.data.results?.map((res: any, i: number) => (
                      <div key={i} className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors">
                         <div className="flex items-start gap-4">
                            <TextSearch className="w-6 h-6 text-blue-500 shrink-0 mt-1" />
                            <div>
                               <p className="text-xl font-bold mb-2 text-white">{res.title}</p>
                               <p className="text-gray-400 leading-relaxed">{res.desc}</p>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
             )}
          </div>
        )}

        {/* System Control View */}
        {activeModule === 'system' && uiData && (
          <div className="absolute inset-x-10 bottom-32 top-48 glass-panel z-20 p-12 transition-all flex flex-col">
             <div className="flex justify-between items-center mb-10 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-500 rounded-2xl flex items-center justify-center"><Terminal className="text-white" /></div>
                  <h2 className="text-3xl font-black italic uppercase">System <span className="text-purple-500">Control</span></h2>
                </div>
                <button onClick={() => setActiveModule('core')} className="p-4 bg-white/5 rounded-full hover:bg-white/10 cursor-pointer"><X /></button>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12 flex-1 min-h-0">
                <div className="space-y-6 flex flex-col h-full">
                   <h3 className="hud-label text-purple-400">⚡ Active Processes</h3>
                   <div className="flex-1 bg-black/50 border border-white/10 rounded-2xl p-6 space-y-4 overflow-y-auto custom-scrollbar">
                      {uiData.data.processes?.map((p: string, i: number) => (
                         <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-xl">
                            <Activity className="w-5 h-5 text-purple-500 animate-pulse" />
                            <p className="font-mono text-sm">{p}</p>
                            <span className="ml-auto text-xs uppercase text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Active</span>
                         </div>
                      ))}
                   </div>
                </div>
                <div className="space-y-6 flex flex-col h-full">
                   <h3 className="hud-label text-purple-400">📟 System Telemetry</h3>
                   <div className="bg-black/50 border border-white/10 rounded-2xl p-6 font-mono text-sm text-gray-400 space-y-2">
                       <p className="flex justify-between"><span>Status:</span> <span className="text-white">{uiData.data.status}</span></p>
                       <div className="h-px w-full bg-white/10 my-4"></div>
                       {uiData.data.logs?.map((l: string, i: number) => <p key={i} className="text-green-400">{">"} {l}</p>)}
                   </div>
                   <div className="grid grid-cols-3 gap-4 mt-auto">
                      <div className="bg-white/5 p-4 rounded-xl text-center border border-white/10">
                         <Cpu className="w-6 h-6 mx-auto mb-2 text-purple-400" />
                         <p className="text-[10px] uppercase tracking-widest font-bold">CPU Core</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-xl text-center border border-white/10">
                         <HardDrive className="w-6 h-6 mx-auto mb-2 text-purple-400" />
                         <p className="text-[10px] uppercase tracking-widest font-bold">Storage</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-xl text-center border border-white/10">
                         <Database className="w-6 h-6 mx-auto mb-2 text-purple-400" />
                         <p className="text-[10px] uppercase tracking-widest font-bold">Memory</p>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}

      </main>

      {/* Control Strip */}
      <footer className="p-12 relative z-50 flex justify-center">
        <div className="max-w-4xl w-full">
          <div className="relative group">
            <div className={`absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-[35px] blur-2xl opacity-10 group-hover:opacity-30 transition-all duration-700`}></div>
            <div className="relative glass-panel p-6 px-10 flex items-center gap-8 shadow-[0_0_100px_rgba(0,0,0,0.5)]">
              
              <div className="flex items-center gap-4">
                {isListening ? (
                  <div className="flex gap-1.5 h-6 items-end">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="w-1 bg-blue-500 rounded-full animate-bounce" style={{ height: `${10 + (i*5)}px`, animationDelay: `${i*0.1}s` }}></div>
                    ))}
                  </div>
                ) : (
                  <MicOff className="text-gray-800 w-6 h-6" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <input 
                  type="text" 
                  value={lastCommand}
                  onChange={(e) => setLastCommand(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && processConversation(lastCommand)}
                  placeholder={`Zeg "${TRIGGER_WORD}, scan mijn systeem" of plan iets...`}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-xl font-light text-white placeholder-gray-800"
                />
              </div>

              <div className="flex items-center gap-6 pr-2">
                {isThinking && <BrainCircuit className="w-6 h-6 text-purple-500 animate-pulse" />}
                <button title="Open Taken" onClick={() => setActiveModule('tasks')} className="p-3 bg-white/5 rounded-xl hover:bg-white/10 hover:text-green-400 transition-all cursor-pointer">
                  <ListTodo className="w-5 h-5" />
                </button>
                <div className="h-10 w-px bg-white/10"></div>
                <button 
                  onClick={() => processConversation(lastCommand)}
                  className="px-10 py-4 bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-blue-500 hover:text-white transition-all transform active:scale-95 shadow-xl cursor-pointer"
                >
                  ✨ Execute
                </button>
              </div>
            </div>
          </div>
          <div className="mt-8 flex justify-center gap-12 text-[10px] uppercase tracking-[0.6em] text-gray-800 font-black">
             <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> System Ready</div>
             <div className="flex items-center gap-2"><ShieldCheck className="w-3 h-3 text-blue-500" /> Secure Protocol</div>
          </div>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>
    </div>
  );
}
