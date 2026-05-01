/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Upload, 
  Play, 
  Trash2, 
  User, 
  Settings, 
  Video, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';
import { Character, ScriptLine, GenerationStatus, Box } from './types';

// Extend window for AI Studio API
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scriptLines, setScriptLines] = useState<ScriptLine[]>([]);
  const [activeBox, setActiveBox] = useState<Box | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('GEMINI_API_KEY') || '');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');

  const imageRef = useRef<HTMLImageElement>(null);

  const colors = [
    { border: 'border-cyan-400/80', bg: 'bg-cyan-400', text: 'text-cyan-400', glow: 'shadow-[0_0_20px_rgba(34,211,238,0.3)]', soft: 'bg-cyan-400/5', lightBorder: 'border-cyan-400/20' },
    { border: 'border-fuchsia-400/80', bg: 'bg-fuchsia-400', text: 'text-fuchsia-400', glow: 'shadow-[0_0_20px_rgba(232,121,249,0.3)]', soft: 'bg-fuchsia-400/5', lightBorder: 'border-fuchsia-400/20' },
    { border: 'border-emerald-400/80', bg: 'bg-emerald-400', text: 'text-emerald-400', glow: 'shadow-[0_0_20px_rgba(52,211,153,0.3)]', soft: 'bg-emerald-400/5', lightBorder: 'border-emerald-400/20' },
    { border: 'border-amber-400/80', bg: 'bg-amber-400', text: 'text-amber-400', glow: 'shadow-[0_0_20px_rgba(251,191,36,0.3)]', soft: 'bg-amber-400/5', lightBorder: 'border-amber-400/20' },
    { border: 'border-rose-400/80', bg: 'bg-rose-400', text: 'text-rose-400', glow: 'shadow-[0_0_20px_rgba(251,113,133,0.3)]', soft: 'bg-rose-400/5', lightBorder: 'border-rose-400/20' },
  ];

  const voiceStyles = [
    "Puck - Nam - Trầm ấm", "Charon - Nam - Mạnh mẽ", "Kore - Nữ - Nhẹ nhàng", "Fenrir - Nam - Khàn đặc", 
    "Oberon - Nam - Quyền lực", "Titania - Nữ - Sang trọng", "Ariel - Nữ - Trong trẻo", "Umbriel - Nam - Huyền bí", 
    "Miranda - Nữ - Ngây thơ", "Bianca - Nữ - Ngọt ngào", "Cressida - Nữ - Quyến rũ", "Desdemona - Nữ - U buồn", 
    "Juliet - Nữ - Trẻ trung", "Portia - Nữ - Thông thái", "Rosalind - Nữ - Năng động", "Belinda - Nữ - Điềm tĩnh", 
    "Perdita - Nữ - Dịu dàng", "Cordelia - Nữ - Trung thực", "Ophelia - Nữ - Mong manh", "Beatrice - Nữ - Sắc sảo", 
    "Hero - Nữ - Nhút nhát", "Viola - Nữ - Kiên cường", "Olivia - Nữ - Quý phái", "Imogen - Nữ - Chung thủy", 
    "Marina - Nữ - Tươi mới", "Paulina - Nữ - Nghiêm khắc", "Emilia - Nữ - Thẳng thắn", "Audrey - Nữ - Mộc mạc", 
    "Phebe - Nữ - Kiêu kỳ", "Ganymede - Nam - Thanh thoát"
  ];

  const getCharColor = (index: number) => colors[index % colors.length];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setCharacters([]);
        setScriptLines([]);
        setVideoUrl(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = (('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left) / rect.width * 100;
    const y = (('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top) / rect.height * 100;
    
    setActiveBox({ x, y, width: 0, height: 0 });
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !activeBox || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const currentX = (('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left) / rect.width * 100;
    const currentY = (('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top) / rect.height * 100;
    
    setActiveBox({
      ...activeBox,
      width: currentX - activeBox.x,
      height: currentY - activeBox.y
    });
  };

  const endDrawing = () => {
    if (!isDrawing || !activeBox) return;
    setIsDrawing(false);
    
    // Minimal size check
    if (Math.abs(activeBox.width) < 2 || Math.abs(activeBox.height) < 2) {
      setActiveBox(null);
      return;
    }

    const newChar: Character = {
      id: crypto.randomUUID(),
      name: `Ch${characters.length + 1}`,
      box: {
        x: activeBox.width < 0 ? activeBox.x + activeBox.width : activeBox.x,
        y: activeBox.height < 0 ? activeBox.y + activeBox.height : activeBox.y,
        width: Math.abs(activeBox.width),
        height: Math.abs(activeBox.height)
      }
    };

    setCharacters([...characters, newChar]);
    setActiveBox(null);
  };

  const addScriptLine = () => {
    if (characters.length === 0) return;
    setScriptLines([...scriptLines, { 
      id: crypto.randomUUID(), 
      characterId: characters[0].id, 
      text: '',
      voiceStyle: voiceStyles[0],
      voiceAccent: 'natural'
    }]);
  };

  const updateScriptLine = (id: string, text: string) => {
    setScriptLines(scriptLines.map(line => line.id === id ? { ...line, text } : line));
  };

  const updateScriptVoice = (id: string, field: 'voiceStyle' | 'voiceAccent', value: any) => {
    setScriptLines(scriptLines.map(line => line.id === id ? { ...line, [field]: value } : line));
  };

  const updateScriptCharacter = (id: string, charId: string) => {
    setScriptLines(scriptLines.map(line => line.id === id ? { ...line, characterId: charId } : line));
  };

  const removeScriptLine = (id: string) => {
    setScriptLines(scriptLines.filter(line => line.id !== id));
  };

  const removeCharacter = (id: string) => {
    setCharacters(characters.filter(c => c.id !== id));
    setScriptLines(scriptLines.filter(line => line.characterId !== id));
  };

  const generateVideo = async () => {
    if (!image || scriptLines.length === 0) return;
    
    const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY || '';
    
    if (!effectiveApiKey) {
      setShowKeyModal(true);
      return;
    }

    setStatus('generating');
    setErrorMessage(null);
    setVideoUrl(null);

    try {
      const currentKey = apiKey || process.env.GEMINI_API_KEY || '';
      const ai = new GoogleGenAI({ apiKey: currentKey });
      
      // Construct prompt
      const characterContext = characters.map(c => 
        `- **${c.name}**: Face located within bounding box [x: ${c.box.x.toFixed(1)}%, y: ${c.box.y.toFixed(1)}%, width: ${c.box.width.toFixed(1)}%, height: ${c.box.height.toFixed(1)}%]`
      ).join('\n');

      const fullScript = scriptLines.map(line => {
        const char = characters.find(c => c.id === line.characterId);
        const accent = {
          'natural': 'giọng và accent mẫu',
          'north': 'giọng và accent miền Bắc Việt Nam',
          'hue': 'giọng và accent tỉnh Huế Việt Nam',
          'central': 'giọng và accent miền Trung Việt Nam',
          'south': 'giọng và accent miền Tây Nam Bộ Việt Nam'
        }[line.voiceAccent];
        
        return `${char?.name} (Giọng style ${line.voiceStyle}, ${accent}): ${line.text}`;
      }).join('\n');

      const prompt = `Generate a high-quality video using the provided image as the starting frame.
There are multiple characters in the scene, identified as follows:
${characterContext}

The video should depict a conversation based on this script:
${fullScript}

Key Requirements:
1. Maintain the identity and appearance of each character as shown in their defined bounding boxes.
2. Animate the characters with realistic lip synchronization that perfectly matches the script lines they speak.
3. Ensure natural facial expressions and slight body movements to make the dialogue feel life-like.
4. The transitions between speakers should be smooth.
5. The output should be a coherent cinematic sequence where each character speaks their assigned lines in the order provided.`;

      const imageBytes = image.split(',')[1];
      const mimeType = image.split(';')[0].split(':')[1];

      // @ts-ignore
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt,
        image: {
          imageBytes,
          mimeType
        },
        config: {
          numberOfVideos: 1,
          resolution,
          aspectRatio: '16:9'
        }
      });

      // Polling
      let pollingAttempts = 0;
      const maxPollingAttempts = 120; // 20 minutes
      while (!operation.done && pollingAttempts < maxPollingAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        // @ts-ignore
        operation = await ai.operations.getVideosOperation({ operation: operation });
        pollingAttempts++;
      }

      if (!operation.done) {
        throw new Error('Generating timed out. Please try again later.');
      }

      const opAny = operation as any;
      const downloadLink = 
        opAny.response?.generatedVideos?.[0]?.video?.uri || 
        opAny.result?.response?.generatedVideos?.[0]?.video?.uri ||
        opAny.generatedVideos?.[0]?.uri ||
        opAny.result?.generatedVideos?.[0]?.uri;

      if (downloadLink) {
        const currentKey = apiKey || process.env.GEMINI_API_KEY || '';
        const res = await fetch(downloadLink, {
          method: 'GET',
          headers: {
            'x-goog-api-key': currentKey,
          },
        });
        
        if (!res.ok) {
          throw new Error('Failed to download the generated video. Please check your network connection.');
        }

        const blob = await res.blob();
        setVideoUrl(URL.createObjectURL(blob));
        setStatus('success');
      } else {
        console.error('Operation result:', opAny);
        
        // Handle RAI (Responsible AI) filters
        const filteredReasons = opAny.response?.raiMediaFilteredReasons || opAny.result?.response?.raiMediaFilteredReasons;
        if (filteredReasons && filteredReasons.length > 0) {
          throw new Error(`Nội dung bị chặn: Bộ lọc Google phát hiện hình ảnh hoặc kịch bản có chứa nội dung bản quyền hoặc người nổi tiếng. Vui lòng thay đổi ảnh hoặc kịch bản khác.`);
        }

        if (opAny.error) {
          throw new Error(`Lỗi tạo video: ${opAny.error.message || JSON.stringify(opAny.error)}`);
        }
        throw new Error('Không thể tạo video. Yêu cầu có thể đã bị chặn bởi bộ lọc nội dung hoặc gặp lỗi kỹ thuật. Hãy thử tránh dùng ảnh người nổi tiếng hoặc nhân vật có bản quyền.');
      }

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred during generation.');
    }
  };

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('GEMINI_API_KEY', key);
    setShowKeyModal(false);
  };

  return (
    <div className="min-h-screen bg-[#303030] text-slate-200 font-sans selection:bg-cyan-500/30 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-32 border-b border-white/10 flex items-center justify-between px-8 bg-black/60 backdrop-blur-md sticky top-0 z-50 shrink-0">
        <div className="flex items-center">
          <motion.h1 
            whileHover={{ scale: 1.2 }}
            transition={{ type: "spring", stiffness: 300, damping: 10 }}
            className="text-[42pt] font-black tracking-tighter uppercase italic neon-text-purple cursor-default"
          >
            📽️ VIDEO LIPSYNC STUDIO
          </motion.h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowKeyModal(true)}
            className={cn(
              "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 btn-glow",
              apiKey 
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]" 
                : "border-red-500/30 bg-red-500/10 text-red-500 animate-[pulse_1.5s_infinite] shadow-[0_0_15px_rgba(239,68,68,0.2)]"
            )}
          >
            <Settings className="w-3.5 h-3.5" />
            {apiKey ? "🔑 API KEY ACTIVE" : "⚠️ SET API KEY"}
          </button>

          <div className="h-6 w-[1px] bg-white/10 mx-2"></div>

          <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
            {(['720p', '1080p'] as const).map(res => (
              <button
                key={res}
                onClick={() => setResolution(res)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all btn-glow",
                  resolution === res ? "bg-white text-black shadow-lg" : "text-slate-500 hover:text-slate-200"
                )}
              >
                {res}
              </button>
            ))}
          </div>
          
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={generateVideo}
            disabled={status === 'generating' || !image || scriptLines.length === 0}
            className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-8 py-3 rounded-xl font-black text-xs tracking-widest uppercase hover:shadow-[0_0_35px_rgba(34,211,238,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 shadow-xl shadow-cyan-500/20 relative overflow-hidden group btn-glow-cyan"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] pointer-events-none" />
            {status === 'generating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            🎬 Render Scene
          </motion.button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left: Image Canvas */}
        <section className="flex-1 flex flex-col gap-4 bg-[#101010] p-6 rounded-[2.5rem] border border-white/5 shadow-inner">
          <div className="flex justify-between items-end px-1">
            <div>
              <h2 className="text-xl font-black tracking-tight uppercase">🖼️ Scene Composer</h2>
              <p className="text-xs text-slate-500 font-medium">Define character frames for Gemini Veo rendering</p>
            </div>
            <div className="flex gap-2">
               <button 
                onClick={() => setImage(null)}
                className="px-4 py-2 bg-white/5 rounded-lg border border-white/10 hover:bg-red-500/20 hover:border-red-500/40 text-slate-400 hover:text-red-400 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 btn-glow"
                title="Clear Image"
                disabled={!image}
              >
                <Trash2 className="w-3.5 h-3.5" />
                🗑️ Clear
              </button>
            </div>
          </div>

          <div className="flex-1 bg-[#303030] rounded-[2rem] relative overflow-hidden border border-cyan-400 shadow-2xl group flex items-center justify-center p-4">
            {!image ? (
              <label className="flex flex-col items-center gap-6 cursor-pointer group">
                <div className="w-28 h-28 rounded-[2.5rem] bg-white/5 flex items-center justify-center border border-dashed border-white/20 group-hover:bg-white/10 group-hover:border-white/40 transition-all group-hover:scale-110 shadow-2xl group-hover:shadow-cyan-500/10">
                  <Upload className="w-12 h-12 text-slate-400 group-hover:text-cyan-400 transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-slate-100 tracking-tight uppercase">📂 Import Visual Asset</p>
                  <p className="text-slate-500 text-sm mt-2 font-medium">Start project with a high-resolution source image</p>
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </label>
            ) : (
              <div className="relative inline-block max-h-full">
                <div 
                  className="relative cursor-crosshair select-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={endDrawing}
                  onMouseLeave={endDrawing}
                >
                  <img 
                    ref={imageRef}
                    src={image} 
                    alt="Source" 
                    className="max-h-[70vh] w-auto rounded-xl shadow-2xl pointer-events-none border border-white/10"
                    draggable={false}
                  />
                  
                  {/* Existing Character Boxes */}
                  {characters.map((char, idx) => {
                    const color = getCharColor(idx);
                    return (
                      <div
                        key={char.id}
                        className={cn("absolute border-2 transition-all flex flex-col", color.border, color.glow)}
                        style={{
                          left: `${char.box.x}%`,
                          top: `${char.box.y}%`,
                          width: `${char.box.width}%`,
                          height: `${char.box.height}%`,
                        }}
                      >
                        <div className={cn("inline-flex items-center gap-2 px-2 py-0.5 self-start text-black text-[10px] font-black uppercase tracking-tighter", color.bg)}>
                          {char.name}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCharacter(char.id);
                            }}
                            className="hover:scale-125 transition-transform btn-glow"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Active drawing box */}
                  {activeBox && (
                    <div
                      className="absolute border-2 border-dashed border-white/50 bg-white/10"
                      style={{
                        left: `${activeBox.width < 0 ? activeBox.x + activeBox.width : activeBox.x}%`,
                        top: `${activeBox.height < 0 ? activeBox.y + activeBox.height : activeBox.y}%`,
                        width: `${Math.abs(activeBox.width)}%`,
                        height: `${Math.abs(activeBox.height)}%`,
                      }}
                    />
                  )}
                </div>

                {/* Status Badge */}
                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-3">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.5)]"></div>
                  <span className="text-[10px] tracking-widest font-mono text-slate-300">
                    {characters.length} CHARACTERS DEFINED | READY FOR PIPELINE
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right: Interaction Panel */}
        <aside className="w-[400px] shrink-0 flex flex-col gap-6 h-full">
          {/* Character Map */}
          <div className="p-5 bg-[#101010] border border-white/10 rounded-[1.5rem] backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
              <div className="w-1 h-3 bg-cyan-400 rounded-full"></div>
              🗺️ Entity Map
            </h3>
            <div className="space-y-2">
              {characters.length === 0 ? (
                <div className="py-8 text-center text-slate-600 text-[10px] uppercase font-bold tracking-widest border border-dashed border-white/5 rounded-xl">
                  No entities identified
                </div>
              ) : (
                characters.map((char, idx) => {
                  const color = getCharColor(idx);
                  return (
                    <div key={char.id} className={cn("flex items-center justify-between p-3 rounded-xl border transition-all", color.soft, color.lightBorder)}>
                      <div className="flex items-center gap-3">
                        <span className={cn("text-[10px] font-mono font-bold px-2 py-0.5 rounded", color.bg, "text-black")}>{char.name}</span>
                        <span className="text-xs text-slate-200 font-medium">Actor_{idx + 1}</span>
                      </div>
                      <div className={cn("w-2 h-2 rounded-full", color.bg, "shadow-lg")}></div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Script Editor Container */}
          <div className="flex-1 bg-[#101010] border border-white/10 rounded-[1.5rem] flex flex-col overflow-hidden backdrop-blur-sm relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02] relative z-10">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <div className="w-1 h-3 bg-fuchsia-400 rounded-full"></div>
                💬 Dialogue Script
              </h3>
              {status === 'generating' && (
                 <span className="text-[10px] text-cyan-400 font-mono flex items-center gap-2 animate-pulse">
                   <Loader2 className="w-3 h-3 animate-spin" />
                   ĐANG XỬ LÝ...
                 </span>
              )}
            </div>

            <div className="flex-1 overflow-auto p-5 scrollbar-thin scrollbar-thumb-white/10">
              {characters.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                  <Maximize2 className="w-12 h-12 text-white/5" />
                  <p className="text-slate-500 text-xs font-medium leading-relaxed">Vui lòng khoanh vùng khuôn mặt nhân vật trên ảnh để bắt đầu viết kịch bản</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Safety Tip */}
                  <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-3 flex gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-200/60 leading-relaxed uppercase font-bold tracking-wider">
                      Lưu ý: Tránh sử dụng ảnh người nổi tiếng, nhân vật có bản quyền (Disney, Marvel...) hoặc địa danh cụ thể để hông bị bộ lọc AI chặn.
                    </p>
                  </div>

                  <AnimatePresence mode="popLayout">
                    {scriptLines.map((line, index) => {
                      const charIdx = characters.findIndex(c => c.id === line.characterId);
                      const color = getCharColor(charIdx >= 0 ? charIdx : 0);
                      
                      return (
                        <motion.div 
                          key={line.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="group relative"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <select 
                                value={line.characterId}
                                onChange={(e) => updateScriptCharacter(line.id, e.target.value)}
                                className={cn("bg-transparent border-none p-0 text-xs font-black uppercase tracking-tighter cursor-pointer focus:outline-none transition-colors", color.text)}
                              >
                                {characters.map(c => (
                                  <option key={c.id} value={c.id} className="bg-[#050508] text-white">{c.name}</option>
                                ))}
                              </select>

                              <div className="flex items-center gap-1 ml-4 bg-white/5 rounded-full px-2 py-0.5 border border-white/5">
                                <select 
                                  value={line.voiceStyle}
                                  onChange={(e) => updateScriptVoice(line.id, 'voiceStyle', e.target.value)}
                                  className="bg-transparent border-none text-[8px] font-bold uppercase tracking-widest text-slate-400 focus:outline-none cursor-pointer"
                                >
                                  {voiceStyles.map(style => (
                                    <option key={style} value={style} className="bg-[#050508]">{style}</option>
                                  ))}
                                </select>
                                <span className="text-[8px] text-white/10">|</span>
                                <select 
                                  value={line.voiceAccent}
                                  onChange={(e) => updateScriptVoice(line.id, 'voiceAccent', e.target.value)}
                                  className="bg-transparent border-none text-[8px] font-bold uppercase tracking-widest text-slate-400 focus:outline-none cursor-pointer"
                                >
                                  <option value="natural" className="bg-[#050508]">Natural</option>
                                  <option value="north" className="bg-[#050508]">North</option>
                                  <option value="hue" className="bg-[#050508]">Hue</option>
                                  <option value="central" className="bg-[#050508]">Central</option>
                                  <option value="south" className="bg-[#050508]">South</option>
                                </select>
                              </div>
                            </div>
                            <button 
                              onClick={() => removeScriptLine(line.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all btn-glow"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <textarea
                            placeholder="Enter dialogue tokens..."
                            value={line.text}
                            onChange={(e) => updateScriptLine(line.id, e.target.value)}
                            className={cn(
                              "w-full bg-black/40 border-l-2 rounded-r-lg p-3 text-sm font-mono focus:outline-none transition-all placeholder:text-slate-700 min-h-[60px] resize-none",
                              color.lightBorder,
                              "border-l-transparent group-hover:border-l-current"
                            )}
                            style={{ borderColor: (charIdx >= 0 ? undefined : 'transparent') }}
                          />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={addScriptLine}
                      className="w-full py-5 border border-dashed border-white/10 rounded-2xl text-slate-500 hover:text-white hover:bg-white/5 hover:border-white/30 transition-all text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 group/btn shadow-lg hover:shadow-cyan-500/5 btn-glow"
                    >
                      <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                      ➕ Inject Sequence
                    </motion.button>
                </div>
              )}
            </div>

            {/* Output / Rendering Area */}
            <div className="p-6 border-t border-white/10 bg-black/60 backdrop-blur-2xl relative z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <div className="w-1 h-2 bg-emerald-400 rounded-full"></div>
                  📺 Global Output
                </h3>
                <span className="text-[9px] text-slate-600 italic">Avoid famous people/copyrighted content</span>
              </div>
              {status === 'generating' ? (
                <div className="space-y-3">
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-blue-600 to-cyan-400"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                  <p className="text-[10px] font-mono text-slate-400 text-center uppercase tracking-widest">Compiling Video Tokens...</p>
                </div>
              ) : videoUrl ? (
                <div className="space-y-4">
                  <div className="aspect-video bg-black rounded-xl overflow-hidden border border-white/10 shadow-2xl relative">
                    <video src={videoUrl} controls className="w-full h-full" autoPlay />
                  </div>
                  <a 
                    href={videoUrl} 
                    download="veosync_output.mp4"
                    className="flex items-center justify-center gap-2 w-full py-4 bg-white/5 hover:bg-emerald-500 text-slate-300 hover:text-black rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-white/10 shadow-lg hover:shadow-emerald-500/20 btn-glow"
                  >
                    💾 Download Master MP4
                  </a>
                </div>
              ) : status === 'error' ? (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-[10px] font-mono text-red-400 truncate">{errorMessage}</p>
                </div>
              ) : (
                <div className="h-12 flex items-center justify-center border border-dashed border-white/5 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-700 tracking-widest uppercase">Output Idle</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="h-10 bg-black/80 border-t border-white/5 px-6 flex items-center justify-between text-[10px] font-mono text-slate-500 shrink-0">
        <div className="flex gap-6 uppercase tracking-wider">
          <span>ENGINE: VEO-ALPHA-V3</span>
          <span>RESOLUTION: {resolution}</span>
          <span className={status === 'generating' ? "text-cyan-400" : ""}>
            STATUS: {status === 'generating' ? "PROCESSING" : "STANDBY"}
          </span>
        </div>
        <div className="flex items-center gap-4">
           {image && (
             <div className="flex items-center gap-2 text-cyan-400/80">
                <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(34,211,238,1)]"></div>
                <span>ASSET SYNCED</span>
             </div>
           )}
           <div className="text-slate-600">v1.2.0-LIPSYNC</div>
        </div>
      </footer>

      {/* Interaction Hint */}
      <AnimatePresence>
        {image && characters.length === 0 && !isDrawing && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-cyan-500 text-black px-8 py-4 rounded-full text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_0_60px_rgba(34,211,238,0.5)] pointer-events-none flex items-center gap-3 z-50"
          >
            <Maximize2 className="w-4 h-4" />
            🖱️ Drag on actors to start tracking
          </motion.div>
        )}
        
        {showKeyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md w-full bg-[#0a0a0f] border border-white/10 p-8 rounded-[2.5rem] shadow-2xl space-y-6"
            >
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                  <Settings className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight uppercase">🔑 API Key Setting</h2>
                  <p className="text-xs text-slate-500">Required for Gemini Veo processing</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Gemini API Key</label>
                  <input 
                    type="password"
                    placeholder="Enter your API Key here..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                    defaultValue={apiKey}
                    id="api-key-input"
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                  * Key is stored locally in your browser and used only for requests to Google Gemini API.
                </p>
              </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowKeyModal(false)}
                    className="flex-1 py-3 px-6 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-colors btn-glow"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      const val = (document.getElementById('api-key-input') as HTMLInputElement)?.value;
                      saveApiKey(val);
                    }}
                    className="flex-1 py-3 px-6 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-white/90 transition-colors btn-glow"
                  >
                    Save Key
                  </button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

