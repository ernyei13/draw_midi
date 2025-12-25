
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera as CameraIcon, RefreshCw, Hand, Info, Box, MousePointer2, Cpu, Music } from 'lucide-react';
import { UIControl, ControlType, HandLandmark } from './types';
import { analyzePaperUI } from './services/geminiService';

// MediaPipe globals from script tags
declare const Hands: any;
declare const Camera: any;

const PINCH_THRESHOLD = 0.045;

const App: React.FC = () => {
  const [controls, setControls] = useState<UIControl[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [lastAction, setLastAction] = useState<string>("Waiting for scan...");
  const [isPinching, setIsPinching] = useState(false);
  const [midiAccess, setMidiAccess] = useState<any>(null);
  const [midiPort, setMidiPort] = useState<string>("");

  const controlsRef = useRef<UIControl[]>([]);
  const lastInteractionRef = useRef<{ [key: string]: number }>({}); 
  const dragStartRef = useRef<{ id: string, startY: number, startVal: number } | null>(null);
  const activeControlIdRef = useRef<string | null>(null); // Captured element for single-focus interaction
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  // Initialize MIDI
  useEffect(() => {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then((access) => {
        setMidiAccess(access);
        const outputs = Array.from(access.outputs.values());
        if (outputs.length > 0) {
          setMidiPort(outputs[0].name);
        }
      });
    }
  }, []);

  const sendMidiCC = (index: number, value: number) => {
    if (!midiAccess) return;
    const outputs = Array.from(midiAccess.outputs.values());
    if (outputs.length === 0) return;

    // Mapping: CC channel 1, CC controller #20 + index, value normalized to 0-127
    const ccValue = Math.floor((value / 100) * 127);
    const msg = [0xB0, 20 + index, ccValue];
    outputs.forEach((out: any) => out.send(msg));
  };

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  const getDistance = (p1: HandLandmark, p2: HandLandmark) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  const onHandResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks: HandLandmark[] = results.multiHandLandmarks[0];
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      
      const distance = getDistance(thumbTip, indexTip);
      const currentlyPinching = distance < PINCH_THRESHOLD;
      setIsPinching(currentlyPinching);

      const cx = indexTip.x * canvas.width;
      const cy = indexTip.y * canvas.height;

      // Minimalist cursor
      ctx.fillStyle = currentlyPinching ? '#ffffff' : 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(cx, cy, currentlyPinching ? 6 : 4, 0, 2 * Math.PI);
      ctx.fill();

      if (currentlyPinching) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, 2 * Math.PI);
        ctx.stroke();
      }

      processInteractions(indexTip, currentlyPinching);
    } else {
      setIsPinching(false);
      activeControlIdRef.current = null;
      dragStartRef.current = null;
      setControls(prev => prev.some(c => c.isHovered || c.isPressed) 
        ? prev.map(c => ({ ...c, isHovered: false, isPressed: false })) 
        : prev
      );
    }
  }, []);

  const processInteractions = (finger: HandLandmark, isPinching: boolean) => {
    const fx = finger.x * 1000;
    const fy = finger.y * 1000;
    const now = Date.now();

    const currentControls = controlsRef.current;
    let needsUpdate = false;

    // Release lock if not pinching
    if (!isPinching) {
      activeControlIdRef.current = null;
    }

    // Step 1: Handle focus capture if we aren't locked but just started pinching
    if (isPinching && activeControlIdRef.current === null) {
      const target = currentControls.find(ctrl => 
        fx >= ctrl.box.xmin && fx <= ctrl.box.xmax &&
        fy >= ctrl.box.ymin && fy <= ctrl.box.ymax
      );
      if (target) {
        activeControlIdRef.current = target.id;
      }
    }

    const nextControls = currentControls.map((ctrl, index) => {
      const inBox = fx >= ctrl.box.xmin && fx <= ctrl.box.xmax &&
                    fy >= ctrl.box.ymin && fy <= ctrl.box.ymax;

      // A control is "active" for interaction ONLY if it is the captured one
      const isActiveInteraction = isPinching && activeControlIdRef.current === ctrl.id;
      
      let newValue = ctrl.value;
      let isPressed = isActiveInteraction;
      let isHovered = inBox;

      if (isActiveInteraction) {
        if (ctrl.type === ControlType.BUTTON) {
          const lastTime = lastInteractionRef.current[ctrl.id] || 0;
          if (now - lastTime > 600) {
            newValue = ctrl.value === 1 ? 0 : 1;
            lastInteractionRef.current[ctrl.id] = now;
            setLastAction(`${ctrl.label}: ${newValue === 1 ? 'ON' : 'OFF'}`);
            sendMidiCC(index, newValue === 1 ? 100 : 0);
            needsUpdate = true;
          }
        } else if (ctrl.type === ControlType.SLIDER) {
          const width = ctrl.box.xmax - ctrl.box.xmin;
          const height = ctrl.box.ymax - ctrl.box.ymin;
          let percent = 0;
          if (width > height) {
            // Horizontal slider uses current finger X relative to the box start
            percent = Math.round(((fx - ctrl.box.xmin) / width) * 100);
          } else {
            // Vertical slider uses current finger Y relative to the box
            percent = Math.round(((ctrl.box.ymax - fy) / height) * 100);
          }
          newValue = Math.max(0, Math.min(100, percent));
          if (newValue !== ctrl.value) {
            setLastAction(`${ctrl.label}: ${newValue}%`);
            sendMidiCC(index, newValue);
            needsUpdate = true;
          }
        } else if (ctrl.type === ControlType.KNOB) {
          if (!dragStartRef.current || dragStartRef.current.id !== ctrl.id) {
            dragStartRef.current = { id: ctrl.id, startY: fy, startVal: ctrl.value };
          }
          const deltaY = dragStartRef.current.startY - fy;
          // Standard knob vertical relative drag logic
          newValue = Math.max(0, Math.min(100, dragStartRef.current.startVal + Math.round(deltaY * 0.5)));
          if (newValue !== ctrl.value) {
            setLastAction(`${ctrl.label}: ${newValue}%`);
            sendMidiCC(index, newValue);
            needsUpdate = true;
          }
        }
      } else {
        // Cleanup drag state for this specific control if it's not the active one
        if (dragStartRef.current?.id === ctrl.id && !isPinching) {
          dragStartRef.current = null;
        }
      }

      if (isHovered !== ctrl.isHovered || isPressed !== ctrl.isPressed || newValue !== ctrl.value) {
        needsUpdate = true;
      }

      return { ...ctrl, isHovered, isPressed, value: newValue };
    });

    if (needsUpdate) {
      setControls(nextControls);
    }
  };

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const hands = new Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.8,
      minTrackingConfidence: 0.8
    });

    hands.onResults(onHandResults);
    handsRef.current = hands;

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (handsRef.current && videoRef.current) {
          await handsRef.current.send({ image: videoRef.current });
        }
      },
      width: 1280,
      height: 720
    });

    camera.start().then(() => setIsCameraReady(true));
    cameraRef.current = camera;

    return () => {
      camera.stop();
      hands.close();
    };
  }, [onHandResults]);

  const captureAndAnalyze = async () => {
    if (!videoRef.current || isScanning) return;
    setIsScanning(true);
    setLastAction("Scanning Drawing...");

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
      const detectedControls = await analyzePaperUI(base64);
      setControls(detectedControls);
      setLastAction(`Ready. ${detectedControls.length} controls mapped.`);
    } catch (err) {
      setLastAction("Scan failed.");
      console.error(err);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        captureAndAnalyze();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isScanning, isCameraReady]);

  return (
    <div className="relative w-screen h-screen bg-[#0a0a0a] overflow-hidden font-sans select-none text-white/90">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale contrast-125"
        playsInline
        muted
      />

      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
      />

      {/* Interface Overlay */}
      <div className="absolute inset-0 pointer-events-none z-20">
        {controls.map((ctrl, idx) => {
          const width = ctrl.box.xmax - ctrl.box.xmin;
          const height = ctrl.box.ymax - ctrl.box.ymin;
          const isHorizontal = width > height;
          const isToggledOn = ctrl.type === ControlType.BUTTON && ctrl.value === 1;
          const isCaptured = activeControlIdRef.current === ctrl.id;

          return (
            <div
              key={ctrl.id}
              style={{
                top: `${ctrl.box.ymin / 10}%`,
                left: `${ctrl.box.xmin / 10}%`,
                width: `${width / 10}%`,
                height: `${height / 10}%`,
              }}
              className={`absolute border transition-all duration-300 flex flex-col items-center justify-center
                ${ctrl.isHovered || isCaptured ? 'border-white bg-white/10' : 'border-white/20 bg-white/5'}
                ${isCaptured ? 'shadow-[0_0_20px_rgba(255,255,255,0.2)] scale-[1.02]' : 'scale-100'}
              `}
            >
              <div className="absolute -top-5 left-0 px-2 py-0.5 bg-black/80 text-[8px] font-bold tracking-widest uppercase">
                {ctrl.label} <span className="text-white/40 ml-1">CC#{20+idx}</span>
              </div>
              
              {ctrl.type === ControlType.SLIDER && (
                <div className="w-full h-full flex items-center justify-center p-2">
                  <div className={`relative bg-white/10 overflow-hidden ${isHorizontal ? 'w-full h-1' : 'h-full w-1'}`}>
                    <div 
                      className="absolute bottom-0 left-0 bg-white transition-all duration-75"
                      style={{ 
                        width: isHorizontal ? `${ctrl.value}%` : '100%',
                        height: isHorizontal ? '100%' : `${ctrl.value}%`
                      }}
                    />
                  </div>
                </div>
              )}

              {ctrl.type === ControlType.BUTTON && (
                <div className={`w-3 h-3 rounded-full transition-all duration-300 ${isToggledOn ? 'bg-white shadow-[0_0_10px_white]' : 'border border-white/40'}`} />
              )}

              {ctrl.type === ControlType.KNOB && (
                <div className="relative w-10 h-10 border border-white/20 rounded-full flex items-center justify-center">
                  <div 
                    className="absolute inset-0 transition-transform duration-75"
                    style={{ transform: `rotate(${(ctrl.value * 3) - 150}deg)` }}
                  >
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-white" />
                  </div>
                  <span className="text-[8px] opacity-40">{ctrl.value}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Minimalist HUD */}
      <div className="absolute inset-0 p-12 flex flex-col justify-between pointer-events-none z-40">
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-2 pointer-events-auto">
            <h1 className="text-2xl font-light tracking-[0.4em] uppercase text-white">
              draw<span className="font-bold">Midi</span>
            </h1>
            <div className="flex items-center gap-3 text-[9px] text-white/40 uppercase tracking-widest">
              <div className={`w-1.5 h-1.5 rounded-full ${isCameraReady ? 'bg-white shadow-[0_0_5px_white]' : 'bg-red-500'}`} />
              {isCameraReady ? 'System Online' : 'Syncing...'}
              {midiPort && <span className="ml-4 flex items-center gap-1"><Music className="w-2.5 h-2.5" /> {midiPort}</span>}
            </div>
          </div>

          <div className="text-right pointer-events-auto">
            <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Monitor</div>
            <div className="font-mono text-[10px] text-white/60 h-8 overflow-hidden">
              {lastAction}
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={captureAndAnalyze}
            disabled={isScanning || !isCameraReady}
            className={`pointer-events-auto px-10 py-3 text-[10px] font-bold uppercase tracking-[0.3em] transition-all border
              ${isScanning 
                ? 'bg-white/5 border-white/10 text-white/20 cursor-wait' 
                : 'bg-transparent border-white/30 hover:bg-white hover:text-black hover:border-white'
              }
            `}
          >
            {isScanning ? 'Mapping...' : 'Sync (Space)'}
          </button>
        </div>
      </div>

      {/* Initial Instruction */}
      {controls.length === 0 && !isScanning && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="max-w-xs text-center animate-in fade-in duration-1000">
             <p className="text-[10px] uppercase tracking-[0.5em] text-white/40 leading-loose">
               Sketch UI components<br/>
               Place paper in view<br/>
               Press sync
             </p>
          </div>
        </div>
      )}

      {/* Global Scan Effect */}
      {isScanning && (
        <div className="absolute inset-0 z-[100] pointer-events-none bg-white/5 backdrop-blur-[2px]">
          <div className="w-full h-[1px] bg-white/40 absolute top-0 animate-[scan_1.5s_linear_infinite]" />
        </div>
      )}

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          50% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default App;
