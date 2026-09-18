import { type ChangeEvent, type DragEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Copy,
  CheckCheck,
  ExternalLink,
  FileImage,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Menu,
  RotateCcw,
  ShieldCheck,
  Phone,
  Radio,
  Cpu,
  Zap,
  Sparkles,
  Terminal,
  Crosshair,
  Layers,
  X,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type AnalysisResult = {
  issue_type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  potential_hazard: string;
  visual_confidence: number;
};

type AuthoritySource = {
  title: string;
  url: string;
  snippet: string;
};

type AuthorityResult = {
  authority_name: string;
  authority_type: string;
  authority_confidence: 'high' | 'medium' | 'low';
  authority_reason: string;
  official_source_url: string;
  contact_information: string;
  generated_complaint: string;
  supporting_sources: AuthoritySource[];
};

function displaySeverity(result: AnalysisResult | null): string {
  if (!result || result.issue_type === 'uncertain' || result.visual_confidence < 65) {
    return 'Needs manual assessment';
  }
  return result.severity;
}

async function parseApiResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (isJson) {
    let payload: any;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`The API server returned an unparseable response (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      const serverError = payload && typeof payload === 'object' && typeof payload.error === 'string' ? payload.error : null;
      throw new Error(serverError || `${fallbackMessage} (HTTP ${response.status})`);
    }

    return payload as T;
  }

  // Non-JSON response (e.g. HTML error page, 502/504 Bad Gateway, or proxy misdirection)
  const previewText = (await response.text().catch(() => '')).trim();
  console.warn('[API Non-JSON Response]', response.status, response.statusText, previewText.slice(0, 200));

  if (!response.ok) {
    throw new Error(`API request failed with HTTP ${response.status} (${response.statusText || 'Non-JSON server response'}).`);
  }

  throw new Error(`The API server returned an HTML document instead of JSON. Please verify the API route configuration.`);
}

function CivicFixLogo({ className = "", iconSize = 28 }: { className?: string, iconSize?: number }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex items-center justify-center">
        <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 opacity-60 blur-xs animate-pulse" />
        <svg width={iconSize} height={iconSize} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="CivicFix Logo" className="relative z-10">
          <rect width="32" height="32" rx="8" fill="#070c18" stroke="#00f0ff" strokeWidth="1.5" />
          <path d="M16 6L25 11.2V19.8C25 24.5 16 27.5 16 27.5C16 27.5 7 24.5 7 19.8V11.2L16 6Z" stroke="#00f0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 16L15 19L20 13" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="font-tech text-[20px] font-bold tracking-wider text-white">
            CIVIC<span className="text-[#00f0ff]">FIX</span>
          </span>
          <span className="rounded border border-cyan-500/40 bg-cyan-950/70 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-widest text-cyan-300">
            2050
          </span>
        </div>
        <span className="font-mono text-[9px] tracking-widest text-slate-400">
          MUNICIPAL NEURAL GRID
        </span>
      </div>
    </div>
  );
}

function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [location, setLocation] = useState('');
  const [locationMethod, setLocationMethod] = useState<'manual' | 'gps'>('manual');
  const [exactLocation, setExactLocation] = useState('');
  const [locationSource, setLocationSource] = useState<'User provided' | 'GPS' | ''>('');
  const [isLocating, setIsLocating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [authorityResult, setAuthorityResult] = useState<AuthorityResult | null>(null);
  const [isFindingAuthority, setIsFindingAuthority] = useState(false);
  const [authorityError, setAuthorityError] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [error, setError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    setError('');
    setHasResult(false);
    setAnalysis(null);
    setAuthorityResult(null);
    setAuthorityError('');
    setAnalysisStatus('');
    const accepted = ['image/jpeg', 'image/png', 'image/webp'];
    if (!accepted.includes(nextFile.type)) {
      setError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (nextFile.size > 500 * 1024) {
      setError('That image is larger than 500 KB. Google Lens accepts smaller images.');
      return;
    }
    setFile(nextFile);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  const removeFile = () => {
    setFile(null);
    setHasResult(false);
    setAnalysis(null);
    setAuthorityResult(null);
    setAuthorityError('');
    setAnalysisStatus('');
    setError('');
  };

  const findAuthority = async (issueType: string, confirmedLocation: string) => {
    setIsFindingAuthority(true);
    setAnalysisStatus('Scanning municipal registries...');
    setAuthorityError('');
    const statusTimers = [
      window.setTimeout(() => setAnalysisStatus('Cross-referencing government jurisdictional matrix...'), 400),
      window.setTimeout(() => setAnalysisStatus('Synthesizing verified civic intelligence...'), 900),
    ];
    try {
      const response = await fetch('/api/find-authority', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          issue_type: issueType,
          location: confirmedLocation,
          exact_location: exactLocation,
          location_source: locationSource,
          severity: analysis?.severity || 'medium',
          potential_hazard: analysis?.potential_hazard || ''
        }),
      });
      const authorityData = await parseApiResponse<AuthorityResult>(
        response,
        'Web intelligence is temporarily unavailable.'
      );
      setAuthorityResult(authorityData);
    } catch (authorityLookupError) {
      setAuthorityError(authorityLookupError instanceof Error ? authorityLookupError.message : 'Web intelligence is temporarily unavailable.');
    } finally {
      statusTimers.forEach((timer) => window.clearTimeout(timer));
      setIsFindingAuthority(false);
      setAnalysisStatus('');
    }
  };

  const requestLocation = () => {
    setIsLocating(true);
    setError('');
    
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setIsLocating(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setExactLocation(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        setLocationSource('GPS');
        
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
          if (res.ok) {
            const data = await res.json();
            const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || '';
            if (city) {
              setLocation(city);
            }
          }
        } catch (e) {
          console.error("Reverse geocoding failed", e);
        }
        
        setIsLocating(false);
      },
      (err) => {
        setError(err.message || 'Unable to retrieve orbital location.');
        setIsLocating(false);
        setLocationMethod('manual');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const analyzeProblem = async () => {
    if (!file) {
      setError('Add optical sensor imagery so CivicFix 2050 can scan the defect.');
      return;
    }
    if (!location.trim()) {
      setError('Add sector or city location so spatial intelligence can resolve jurisdiction.');
      document.getElementById('problem-location')?.focus();
      return;
    }
    setError('');
    setHasResult(false);
    setAnalysis(null);
    setAuthorityResult(null);
    setAuthorityError('');
    setIsAnalyzing(true);
    setAnalysisStatus('Uploading sensor stream...');
    const statusTimers = [
      window.setTimeout(() => setAnalysisStatus('Executing Google Lens optical spectral scan...'), 700),
    ];
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/analyze-problem', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
        body: formData,
      });
      const analysisResult = await parseApiResponse<AnalysisResult>(
        response,
        'Image analysis failed. Please try again.'
      );
      setAnalysis(analysisResult);
      setIsAnalyzing(false);
      setHasResult(true);
      statusTimers.forEach((timer) => window.clearTimeout(timer));
      void findAuthority(analysisResult.issue_type, location.trim());
      window.setTimeout(() => document.getElementById('analysis-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (analysisError) {
      statusTimers.forEach((timer) => window.clearTimeout(timer));
      setIsAnalyzing(false);
      setAnalysisStatus('');
      setError(analysisError instanceof Error ? analysisError.message : 'Image analysis failed. Please try again.');
    }
  };

  const scrollToReport = () => {
    document.getElementById('report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileMenuOpen(false);
  };

  return (
    <main className="civic-page">
      <div className="app-shell">
        {/* Futuristic 2050 Header Bar */}
        <header className="border-b border-cyan-500/20 bg-[#060a14]/85 backdrop-blur-md sticky top-0 z-40" data-testid="header-navigation">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
            <a href="#top" className="focus-ring rounded-lg" data-testid="link-home">
              <CivicFixLogo />
            </a>

            <div className="hidden lg:flex items-center gap-6 font-mono text-[12px] text-slate-400">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-emerald-400 font-semibold tracking-wider">NEURAL GRID: ACTIVE</span>
              </div>
              <span className="text-slate-600">|</span>
              <span className="hover:text-cyan-400 transition-colors">SECTOR RESOLVER v50.4</span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-400/80">LENS SPECTRAL INTERFACE</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-950/60 px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.15)]">
                <Radio size={12} className="text-[#00f0ff] animate-pulse" />
                2050 PROTOCOL
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="focus-ring rounded-lg border border-cyan-500/30 bg-[#0a1122] p-2 text-cyan-400 md:hidden"
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                data-testid="button-mobile-menu"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </header>

        {mobileMenuOpen && (
          <nav className="mx-5 mb-3 mt-2 flex flex-col gap-1.5 rounded-xl border border-cyan-500/30 bg-[#090e1c] p-3 shadow-[0_0_30px_rgba(0,240,255,0.15)] md:hidden z-50 relative" aria-label="Mobile navigation" data-testid="mobile-navigation">
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-4 py-2.5 font-tech text-sm font-semibold text-slate-200 hover:bg-cyan-950/60 hover:text-cyan-400" data-testid="link-mobile-how-it-works">Protocol Pipeline</a>
            <a href="#why-civicfix" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-4 py-2.5 font-tech text-sm font-semibold text-slate-200 hover:bg-cyan-950/60 hover:text-cyan-400" data-testid="link-mobile-why-civicfix">Security & Trust</a>
            <button type="button" onClick={scrollToReport} className="rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2.5 text-left font-tech text-sm font-bold text-[#05080e]" data-testid="button-mobile-start-report">Engage Sensor Portal</button>
          </nav>
        )}

        {/* Hero & Diagnostic Section */}
        <section id="top" className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:px-10 lg:pb-28 lg:pt-16">
          <div className="rise-in">
            <div className="inline-flex items-center gap-2 rounded border border-cyan-500/30 bg-cyan-950/50 px-3 py-1 font-mono text-[11px] font-semibold text-cyan-400 tracking-wider mb-6">
              <Terminal size={13} className="text-cyan-400" />
              <span>SYS.PROTOCOL // CIVIC INFRASTRUCTURE AUTONOMY 2050</span>
            </div>

            <h1 className="max-w-[620px] font-tech text-[clamp(2.4rem,5.5vw,4.2rem)] font-bold leading-[1.05] tracking-tight text-white">
              Next-gen municipal diagnostics.<br/>
              <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                Turn civic defects into direct action.
              </span>
            </h1>

            <p className="mt-6 max-w-[500px] text-[16px] leading-relaxed text-slate-300">
              Deploy optical spectral intelligence to diagnose potholes, hazards, and failures. Automatically cross-reference live government jurisdiction and generate actionable, verified complaint drafts.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3 max-w-[500px]">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left">
                <p className="font-mono text-[10px] uppercase tracking-wider text-cyan-400">OPTICAL SENSING</p>
                <p className="mt-1 font-tech text-[14px] font-bold text-white">Google Lens AI</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left">
                <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">JURISDICTION</p>
                <p className="mt-1 font-tech text-[14px] font-bold text-white">Live Web Directory</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left">
                <p className="font-mono text-[10px] uppercase tracking-wider text-amber-400">DISPATCH READY</p>
                <p className="mt-1 font-tech text-[14px] font-bold text-white">Neural Draft</p>
              </div>
            </div>
          </div>

          {/* 2050 Futuristic Diagnostic Upload Portal */}
          <div id="report" className="rise-in rise-in-delay scroll-mt-8">
            <div className="hud-panel relative rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,240,255,0.08)]">
              <div className="hud-corner-tl" />
              <div className="hud-corner-tr" />
              <div className="hud-corner-bl" />
              <div className="hud-corner-br" />

              <div className="mb-6 flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                    <p className="font-mono text-[11px] font-bold tracking-widest text-cyan-400 uppercase">TELEMETRY INGESTION PORT // 01</p>
                  </div>
                  <h2 className="mt-1 font-tech text-[20px] font-bold tracking-wide text-white">Upload Infrastructure Defect</h2>
                  <p className="mt-0.5 text-[13px] text-slate-400">Potholes, damaged transit, electrical hazards, sanitation</p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 rounded border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-[10px] text-slate-400">
                  <Cpu size={12} className="text-cyan-400" />
                  <span>AI CORE ACTIVE</span>
                </div>
              </div>

              {/* Optical Chamber Dropzone */}
              <div
                className={`upload-zone relative flex min-h-[230px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-cyan-500/25 bg-[#060b17] px-5 py-6 text-center transition-all hover:border-cyan-400 hover:shadow-[0_0_30px_rgba(0,240,255,0.15)] ${isDragging ? 'is-dragging' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }}
                aria-label="Upload a photo of the problem"
                data-testid="dropzone-photo"
              >
                {/* Laser beam sweep effect */}
                <div className="scan-laser absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#00f0ff] to-transparent pointer-events-none z-20 shadow-[0_0_12px_#00f0ff]" />

                {/* Corner Crosshairs */}
                <div className="absolute top-2 left-2 font-mono text-[9px] text-cyan-500/40 pointer-events-none">+</div>
                <div className="absolute top-2 right-2 font-mono text-[9px] text-cyan-500/40 pointer-events-none">+</div>
                <div className="absolute bottom-2 left-2 font-mono text-[9px] text-cyan-500/40 pointer-events-none">+</div>
                <div className="absolute bottom-2 right-2 font-mono text-[9px] text-cyan-500/40 pointer-events-none">+</div>

                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="sr-only" data-testid="input-photo" />
                
                {previewUrl ? (
                  <>
                    <img src={previewUrl} alt="Preview of the selected infrastructure problem" className="absolute inset-0 h-full w-full object-cover" data-testid="img-photo-preview" />
                    
                    {/* Futuristic HUD overlay over preview image */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/60 pointer-events-none" />
                    
                    {/* Reticle center */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="h-16 w-16 rounded-full border border-cyan-400/40 flex items-center justify-center animate-pulse">
                        <Crosshair size={24} className="text-cyan-400/80" />
                      </div>
                    </div>

                    <div className="absolute top-3 inset-x-4 flex items-center justify-between pointer-events-none">
                      <span className="rounded border border-cyan-400/40 bg-black/70 px-2 py-0.5 font-mono text-[10px] text-cyan-300 backdrop-blur-md">
                        OPTICAL SCAN LOCKED
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 bg-black/60 px-2 py-0.5 rounded">
                        2050.LENS.VERIFIED
                      </span>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-4 pt-10 text-white z-30">
                      <div className="min-w-0 flex flex-col items-start">
                        <p className="truncate font-mono text-[12px] font-bold text-white drop-shadow-md" data-testid="text-photo-name">
                          {file?.name}
                        </p>
                        <span className="font-mono text-[10px] text-emerald-400">
                          {((file?.size || 0) / 1024).toFixed(1)} KB · RESOLVED
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); removeFile(); }}
                        className="focus-ring ml-3 shrink-0 rounded-lg border border-white/20 bg-black/70 p-2 text-slate-300 backdrop-blur-md hover:bg-rose-950/80 hover:text-rose-400 transition-colors"
                        aria-label="Remove selected photo"
                        data-testid="button-remove-photo"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center z-10">
                    <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/40 bg-cyan-950/40 text-[#00f0ff] shadow-[0_0_20px_rgba(0,240,255,0.2)]">
                      <FileImage size={28} strokeWidth={1.75} />
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 px-5 py-2.5 font-tech text-[13px] font-bold text-[#05080e] shadow-[0_0_20px_rgba(0,240,255,0.3)] hover:brightness-110 transition-all">
                      <Crosshair size={15} /> Select Optical Imagery
                    </span>
                    <p className="mt-3 font-mono text-[11px] text-slate-400">
                      JPG, PNG or WEBP · Target max 500 KB · Lens Compatible
                    </p>
                  </div>
                )}
              </div>

              {file && (
                <div className="mt-3 flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="focus-ring flex items-center gap-2 font-mono text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                    data-testid="button-replace-photo"
                  >
                    <RotateCcw size={12} /> Replace Optical Feed
                  </button>
                  <span className="font-mono text-[10px] text-slate-500">FORMAT: ENCRYPTED BITSTREAM</span>
                </div>
              )}

              {/* Spatial Location Matrix */}
              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="flex items-center justify-between">
                  <label htmlFor="problem-location" className="font-mono text-[11px] font-bold tracking-wider text-slate-300 uppercase flex items-center gap-2">
                    <MapPin size={13} className="text-cyan-400" />
                    Spatial Sector Coordinates
                  </label>
                  <span className="font-mono text-[10px] text-slate-500">MUNICIPAL MATRIX</span>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => { setLocationMethod('gps'); requestLocation(); }}
                    className={`focus-ring flex-1 rounded-xl border py-2.5 px-3 font-tech text-[12px] font-semibold transition-all flex items-center justify-center gap-2 ${
                      locationMethod === 'gps'
                        ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                        : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-cyan-500/40 hover:text-white'
                    }`}
                  >
                    {isLocating ? <LoaderCircle size={15} className="animate-spin text-cyan-400" /> : <LocateFixed size={15} className="text-cyan-400" />}
                    <span>Orbital GPS Lock</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => { setLocationMethod('manual'); setLocationSource('User provided'); setExactLocation(''); }}
                    className={`focus-ring flex-1 rounded-xl border py-2.5 px-3 font-tech text-[12px] font-semibold transition-all flex items-center justify-center gap-2 ${
                      locationMethod === 'manual'
                        ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                        : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-cyan-500/40 hover:text-white'
                    }`}
                  >
                    <MapPin size={15} className="text-cyan-400" />
                    <span>Sector Input (Manual)</span>
                  </button>
                </div>

                {locationMethod === 'manual' ? (
                  <div className="relative mt-3">
                    <input
                      id="problem-location"
                      type="text"
                      value={location}
                      onChange={(event) => { setLocation(event.target.value); setError(''); setLocationSource('User provided'); setExactLocation(''); }}
                      placeholder="Enter city or area (e.g. Tirupati)"
                      className="focus-ring h-12 w-full rounded-xl border border-white/15 bg-[#070c18] px-4 font-mono text-[13px] text-white placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(0,240,255,0.15)]"
                      data-testid="input-problem-location"
                    />
                    {location && (
                      <div className="mt-2 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 font-mono text-[11px] text-slate-400">
                        <span className="flex items-center gap-1.5 text-cyan-300">
                          <Check size={13} className="text-cyan-400" /> Location: {location}
                        </span>
                        <span className="text-slate-500 text-[10px]">User-provided · Exact location not provided</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-white/10 bg-[#070c18] p-3.5 font-mono text-[12px]">
                    {isLocating ? (
                      <span className="flex items-center gap-2 text-cyan-400">
                        <LoaderCircle size={15} className="animate-spin" /> Synchronizing with orbital constellation...
                      </span>
                    ) : location ? (
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-2 font-bold text-emerald-400">
                          <Check size={14} /> Location: {location}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          GPS-provided · Coordinates: {exactLocation || 'Resolved'} · Exact location provided
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-500">Orbital satellite telemetry pending trigger...</span>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3.5 font-mono text-[12px] text-rose-300" role="alert" data-testid="status-upload-error">
                  <CircleAlert size={16} className="text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                onClick={analyzeProblem}
                disabled={isAnalyzing || isFindingAuthority}
                className="cyber-btn focus-ring mt-6 flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 px-6 font-tech text-[15px] font-bold tracking-wider text-[#05080e] shadow-[0_0_25px_rgba(0,240,255,0.35)] transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-75 cursor-pointer"
                data-testid="button-analyze-problem"
              >
                {isAnalyzing || isFindingAuthority ? (
                  <>
                    <LoaderCircle size={18} className="animate-spin text-[#05080e]" />
                    <span className="font-mono tracking-normal">{analysisStatus || 'EXECUTING NEURAL SCAN...'}</span>
                  </>
                ) : (
                  <>
                    <span>INITIATE NEURAL DIAGNOSIS // 2050</span>
                    <ArrowRight size={18} className="text-[#05080e]" />
                  </>
                )}
              </button>

              <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[10px] text-slate-500 text-center">
                <ShieldCheck size={12} className="text-cyan-500" />
                <span>Imagery processed via SerpApi Lens Gateway · No persistent telemetry cached</span>
              </div>
            </div>
          </div>
        </section>

        {/* 2050 Results Command Deck */}
        {hasResult && (
          <section id="analysis-result" className="mx-auto max-w-7xl scroll-mt-12 px-5 pb-24 sm:px-8 lg:px-10" aria-live="polite">
            <div className="hud-panel relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#070b16] p-6 sm:p-8 lg:p-10 shadow-[0_0_60px_rgba(0,240,255,0.12)] text-white">
              <div className="hud-corner-tl" />
              <div className="hud-corner-tr" />
              <div className="hud-corner-bl" />
              <div className="hud-corner-br" />

              {/* Status Header */}
              <div className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-widest text-cyan-400">
                    <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                    <span>DIAGNOSTIC TELEMETRY PACKET // RESOLUTION 2050</span>
                  </div>
                  <h2 className="mt-1 font-tech text-[30px] sm:text-[38px] font-bold tracking-wide text-white">
                    Diagnostic Telemetry Resolved.
                  </h2>
                  <p className="mt-1 max-w-xl text-[13px] text-slate-400">
                    Combines Google Lens optical signature with live municipal web intelligence. Verified diagnostic advisory; not a legal decree.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2">
                    <FileImage size={17} className="text-cyan-400" />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] font-bold text-white max-w-[150px]" data-testid="text-result-file">{file?.name}</p>
                      <p className="font-mono text-[9px] text-slate-500">SPECTRAL SCAN COMPLETE</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/60 px-3.5 py-2 font-mono text-[10px] font-bold text-cyan-300">
                    POWERED BY SERPAPI
                  </div>
                </div>
              </div>

              {/* Anomaly & Risk Overview Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                {/* Detected Issue */}
                <div className="rounded-2xl border border-white/10 bg-[#090e1c] p-5 sm:col-span-2">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <p className="font-mono text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                      ANOMALY CLASSIFICATION
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/50 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" /> Lens evidence · not official
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
                    <div>
                      <p className="font-tech text-[28px] sm:text-[34px] font-bold capitalize text-white tracking-wide" data-testid="result-problem-type">
                        {analysis?.issue_type}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">Optical Pattern Confidence: {analysis?.visual_confidence ? `${analysis.visual_confidence}%` : 'Empirical'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[10px] tracking-widest text-slate-400 uppercase">SEVERITY INDEX</p>
                      <p className="mt-1 font-tech text-[20px] font-bold capitalize text-amber-400" data-testid="result-severity">
                        {displaySeverity(analysis)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Spatial Sector */}
                <div className="rounded-2xl border border-white/10 bg-[#090e1c] p-5">
                  <p className="font-mono text-[10px] font-bold tracking-widest text-slate-400 uppercase">LOCATION</p>
                  <p className="mt-3 flex items-start gap-2 font-tech text-[18px] font-bold text-white" data-testid="result-location">
                    <MapPin size={18} className="mt-0.5 shrink-0 text-cyan-400" />
                    {location}
                  </p>
                  <div className="mt-3 border-t border-white/5 pt-2 font-mono text-[11px] leading-5 text-slate-400" data-testid="result-exact-location">
                    <div><span className="text-slate-300 font-medium">Exact location:</span> {exactLocation ? <span className="text-emerald-400 font-bold">Available</span> : 'Not provided'}</div>
                    <div><span className="text-slate-300 font-medium">Source:</span> {locationSource || 'User provided'}</div>
                  </div>
                </div>

                {/* Hazard Potential */}
                <div className="rounded-2xl border border-white/10 bg-[#090e1c] p-5">
                  <p className="font-mono text-[10px] font-bold tracking-widest text-slate-400 uppercase">POTENTIAL HAZARD</p>
                  <p className="mt-3 font-tech text-[15px] font-bold leading-6 text-amber-300" data-testid="result-hazard">
                    {analysis?.potential_hazard}
                  </p>
                  <p className="mt-2 font-mono text-[10px] text-slate-500">MUNICIPAL RISK VECTOR</p>
                </div>
              </div>

              {/* Technical Description */}
              <div className="mb-6 rounded-2xl border border-white/10 bg-[#090e1c] p-5">
                <p className="font-mono text-[10px] font-bold tracking-widest text-slate-400 uppercase">DESCRIPTION</p>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-200" data-testid="result-description">
                  {analysis?.description}
                </p>
              </div>

              {/* Tri-Column Authority, Evidence, & Complaint Deck */}
              <div className="grid gap-6 lg:grid-cols-2">
                <AuthorityCard
                  result={authorityResult}
                  isLoading={isFindingAuthority}
                  error={authorityError}
                  location={location}
                  exactLocation={exactLocation}
                />

                <div className="flex flex-col gap-6">
                  <ComplaintCard
                    result={authorityResult}
                    isLoading={isFindingAuthority}
                    error={authorityError}
                  />
                  <EvidenceCard
                    result={authorityResult}
                    isLoading={isFindingAuthority}
                    error={authorityError}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 2050 Architecture / Pipeline */}
        <section id="how-it-works" className="border-y border-cyan-500/20 bg-[#060a15] px-5 py-20 sm:px-8 lg:px-10 lg:py-28 relative">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <div className="rise-in">
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-cyan-400">
                // SYSTEM WORKFLOW 2050
              </p>
              <h2 className="mt-4 font-tech text-[36px] sm:text-[46px] font-bold leading-tight tracking-tight text-white">
                From empirical sighting to structured municipal resolution.
              </h2>
              <p className="mt-6 text-[15px] leading-relaxed text-slate-300">
                You document the infrastructure failure. CivicFix activates optical pattern classification, triangulates jurisdictional boundaries, and prepares verified complaints.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <StepCard
                number="01"
                title="Optical Sensing"
                copy="Capture high-fidelity imagery of the infrastructure defect using any connected visual device."
              />
              <StepCard
                number="02"
                title="Spatial Triangulation"
                copy="Lock geographical sector through satellite orbital GPS or municipal neighborhood indexing."
              />
              <StepCard
                number="03"
                title="Jurisdiction Resolution"
                copy="Automated cross-referencing against verified municipal departments and grievance registries."
              />
              <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/60 to-[#071329] p-6 sm:col-span-2 flex items-center justify-between gap-6">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-400">CIVIC AUTONOMY</p>
                  <p className="mt-2 font-tech text-[22px] font-bold text-white tracking-wide">
                    Better cities evolve when citizens are equipped with precision tools.
                  </p>
                </div>
                <div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-400">
                  <Sparkles size={28} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2050 Trust & Security */}
        <section id="why-civicfix" className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:px-10 lg:py-28">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-cyan-400">
              // DESIGNED FOR PROTOCOL INTEGRITY
            </p>
            <h2 className="mt-4 font-tech text-[36px] sm:text-[46px] font-bold leading-tight tracking-tight text-white">
              Deterministic, transparent, without government pretense.
            </h2>
            <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
              <TrustRow
                title="Transparent Evidence"
                copy="Clear distinction between verified official government domains, reputable directory sources, and social media signals."
              />
              <TrustRow
                title="Honest Confidence"
                copy="When exact street jurisdiction is unverified, results explicitly state 'Potential Authority' and 'Moderate evidence' without fabricated percentages."
              />
              <TrustRow
                title="Zero Credential Burden"
                copy="Instant access without accounts, tracking, or bureaucratic lock-in. Immediate utility for every resident."
              />
            </div>
          </div>

          <div className="hud-panel relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-3xl p-8 sm:p-10 text-white">
            <div className="hud-corner-tl" />
            <div className="hud-corner-tr" />
            <div className="hud-corner-bl" />
            <div className="hud-corner-br" />

            <div className="flex items-center justify-between">
              <ShieldCheck size={32} className="text-cyan-400" />
              <span className="font-mono text-[10px] text-slate-500">TELEMETRY TRUST v2050</span>
            </div>
            
            <div className="mt-8">
              <p className="font-tech text-[24px] sm:text-[28px] font-bold leading-snug text-white">
                "Your city transmits continuous infrastructure signals. CivicFix transforms them into actionable records."
              </p>
              <p className="mt-4 font-mono text-[11px] text-cyan-400/80">
                Civic Intelligence Prototype · Year 2050 Standard
              </p>
            </div>
          </div>
        </section>

        {/* 2050 FAQ Section */}
        <section id="faq" className="border-t border-cyan-500/20 bg-[#060a14] px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-3xl">
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-cyan-400 text-center">
              // FREQUENTLY RESOLVED QUERIES
            </p>
            <h2 className="mt-3 text-center font-tech text-[36px] sm:text-[44px] font-bold text-white">
              Before You Dispatch
            </h2>
            <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
              <Faq
                question="Do I need to know the specific municipal department beforehand?"
                answer="No. The jurisdictional engine analyzes the problem category and spatial coordinates to identify the most probable department automatically."
              />
              <Faq
                question="Is CivicFix directly connected to government grievance portals?"
                answer="CivicFix verifies official reporting URLs and direct helplines, synthesizing a formatted complaint draft ready to paste directly into government portals."
              />
              <Faq
                question="What constitutes optimal optical sensor input?"
                answer="Capture the issue with surrounding roadway or structural context, followed by a clear view of the defect. Avoid capturing faces or personally identifying markers."
              />
            </div>
          </div>
        </section>

        {/* 2050 Cyber Footer */}
        <footer className="border-t border-cyan-500/20 bg-[#05080e] px-5 py-10 text-white sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <CivicFixLogo iconSize={24} className="opacity-90" />
            <p className="font-mono text-[11px] text-slate-400">
              Autonomous Municipal Diagnostics Protocol · CivicFix 2050
            </p>
            <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>NODES: ALL ONLINE</span>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

function AuthorityCard({
  result,
  isLoading,
  error,
  location,
  exactLocation
}: {
  result: AuthorityResult | null;
  isLoading: boolean;
  error: string;
  location: string;
  exactLocation: string;
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-cyan-500/30 bg-[#090e1c] p-6 shadow-[0_0_30px_rgba(0,240,255,0.06)]">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-cyan-400">
          <ShieldCheck size={16} />
          <span>POTENTIAL AUTHORITY</span>
        </div>
        <p className="mt-4 flex items-center gap-2.5 font-mono text-[13px] text-slate-400">
          <LoaderCircle size={16} className="animate-spin text-cyan-400" /> Searching verified government registries…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-[#090e1c] p-6 shadow-[0_0_30px_rgba(244,63,94,0.06)]">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-rose-400">
          <ShieldCheck size={16} />
          <span>POTENTIAL AUTHORITY</span>
        </div>
        <p className="mt-4 font-mono text-[13px] text-slate-400">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#090e1c] p-6">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-cyan-400">
          <ShieldCheck size={16} />
          <span>POTENTIAL AUTHORITY</span>
        </div>
        <p className="mt-4 font-mono text-[13px] text-slate-500">Awaiting web intelligence telemetry…</p>
      </div>
    );
  }

  const mapConfidence = (c: string) => {
    if (c === 'high') return 'Strong';
    if (c === 'medium') return 'Moderate';
    return 'Limited';
  };

  const contacts = result.contact_information && result.contact_information !== 'No official contact information was found.'
    ? result.contact_information.split(' · ')
    : [];

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-[#090e1c] p-6 shadow-[0_0_40px_rgba(0,240,255,0.08)] text-white" data-testid="result-authority">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-cyan-400">
          <ShieldCheck size={16} />
          <span>POTENTIAL AUTHORITY</span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">JURISDICTION MATRIX</span>
      </div>

      <p className="mt-4 font-tech text-[24px] sm:text-[28px] font-bold leading-tight text-white tracking-wide" data-testid="result-authority-name">
        {result.authority_name || 'Authority not available'}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/60 px-3 py-1 font-mono text-[11px] font-semibold text-cyan-300" data-testid="result-authority-confidence">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/40" />
          </span>
          Evidence strength: {mapConfidence(result.authority_confidence || 'low')}
        </span>
      </div>

      <div className="mt-6 border-t border-white/10 pt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
          WHY THIS AUTHORITY?
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-300" data-testid="result-authority-reason">
          {result.authority_reason || 'No reason was returned.'}
        </p>
      </div>

      <div className="mt-6 border-t border-white/10 pt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
          WHAT WOULD CHANGE THIS RESULT?
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
          Exact road jurisdiction cannot be confirmed because the user provided {location} but not the specific street, landmark, road number, or GPS location.
        </p>
      </div>

      <div className="mt-6 border-t border-white/10 pt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
          REPORTING CHANNEL
        </p>
        {result.official_source_url ? (
          <a
            href={result.official_source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-2 font-mono text-[13px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
            data-testid="result-complaint-url"
          >
            <span>{result.official_source_url.toLowerCase().includes('grievance') ? 'General government grievance channel' : 'Verified official reporting channel'}</span>
            <ExternalLink size={14} />
          </a>
        ) : (
          <p className="mt-2 font-mono text-[13px] text-slate-500">No official complaint URL found.</p>
        )}
      </div>

      {contacts.length > 0 && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
            OFFICIAL CONTACT
          </p>
          <ul className="mt-3 space-y-3" data-testid="result-contact-information">
            {contacts.map((contact, i) => (
              <li key={i} className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-mono text-[14px] font-bold text-white">
                    <Phone size={15} className="text-cyan-400" /> {contact}
                  </span>
                  <a
                    href={`tel:${contact.replace(/[^0-9+]/g, '')}`}
                    className="rounded border border-cyan-500/40 bg-cyan-950/70 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300 hover:bg-cyan-900 transition-colors"
                  >
                    DIAL
                  </a>
                </div>
                <span className="flex items-center gap-1 font-mono text-[11px] font-medium text-emerald-400">
                  <Check size={13} /> Verified from official source
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ComplaintCard({
  result,
  isLoading,
  error
}: {
  result: AuthorityResult | null;
  isLoading: boolean;
  error: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    if (!result?.generated_complaint) return;
    navigator.clipboard.writeText(result.generated_complaint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#090e1c] p-6">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-cyan-400">
          <ArrowDownRight size={16} />
          <span>COMPLAINT DRAFT</span>
        </div>
        <p className="mt-4 flex items-center gap-2 font-mono text-[13px] text-slate-400">
          <LoaderCircle size={16} className="animate-spin text-cyan-400" /> Synthesizing citizen grievance draft…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-[#090e1c] p-6">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-rose-400">
          <ArrowDownRight size={16} />
          <span>COMPLAINT DRAFT</span>
        </div>
        <p className="mt-4 font-mono text-[13px] text-slate-400">Could not generate a complaint due to an error.</p>
      </div>
    );
  }

  if (!result?.generated_complaint) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#090e1c] p-6">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-cyan-400">
          <ArrowDownRight size={16} />
          <span>COMPLAINT DRAFT</span>
        </div>
        <p className="mt-4 font-mono text-[13px] text-slate-500">The AI-generated complaint will appear here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-[#090e1c] p-6 shadow-[0_0_30px_rgba(0,240,255,0.06)] text-white" data-testid="result-complaint">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-cyan-400">
          <ArrowDownRight size={16} />
          <span>COMPLAINT DRAFT</span>
        </div>
        <button
          type="button"
          onClick={copyToClipboard}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/60 px-3 py-1 font-mono text-[11px] font-semibold text-cyan-300 hover:bg-cyan-900 transition-colors"
        >
          {copied ? (
            <>
              <CheckCheck size={13} className="text-emerald-400" />
              <span>COPIED TO CLIPBOARD</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>COPY DRAFT</span>
            </>
          )}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-[#060a14] p-4 font-mono text-[12px] leading-relaxed text-slate-200">
        <p className="whitespace-pre-wrap">{result.generated_complaint}</p>
      </div>
    </div>
  );
}

function EvidenceCard({
  result,
  isLoading,
  error
}: {
  result: AuthorityResult | null;
  isLoading: boolean;
  error: string;
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#090e1c] p-6">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-cyan-400">
          <ClipboardCheck size={16} />
          <span>EVIDENCE</span>
        </div>
        <p className="mt-4 flex items-center gap-2 font-mono text-[13px] text-slate-400">
          <LoaderCircle size={16} className="animate-spin text-cyan-400" /> Collecting supporting sources…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-[#090e1c] p-6">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-rose-400">
          <ClipboardCheck size={16} />
          <span>EVIDENCE</span>
        </div>
        <p className="mt-4 font-mono text-[13px] text-slate-400">No sources available because the web lookup failed.</p>
      </div>
    );
  }

  if (!result?.supporting_sources?.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#090e1c] p-6">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-cyan-400">
          <ClipboardCheck size={16} />
          <span>EVIDENCE</span>
        </div>
        <p className="mt-4 font-mono text-[13px] text-slate-500">No supporting sources were returned.</p>
      </div>
    );
  }

  const officials = result.supporting_sources.filter(
    (s) => s.url.includes('.gov') || s.url.includes('nic.in') || s.url.includes('municipal')
  );
  const socials = result.supporting_sources.filter(
    (s) =>
      s.url.includes('facebook.com') ||
      s.url.includes('twitter.com') ||
      s.url.includes('x.com') ||
      s.url.includes('instagram.com')
  );
  const supporting = result.supporting_sources.filter((s) => !officials.includes(s) && !socials.includes(s));

  const renderSourceList = (
    sources: typeof result.supporting_sources,
    label: string,
    icon: ReactNode,
    desc: string
  ) => {
    if (sources.length === 0) return null;
    return (
      <div className="mb-6 last:mb-0">
        <div className="flex items-center justify-between mb-2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            {label}
          </p>
          <p className="font-mono text-[10px] text-cyan-400 font-semibold flex items-center gap-1">
            {icon} {desc}
          </p>
        </div>
        <div className="space-y-3">
          {sources.map((source) => {
            const domain = new URL(source.url).hostname.replace('www.', '');
            return (
              <div key={source.url} className="group rounded-xl border border-white/10 bg-white/[0.02] p-3 hover:border-cyan-400/40 hover:bg-cyan-950/20 transition-colors">
                <a href={source.url} target="_blank" rel="noreferrer" className="block outline-none">
                  <p className="font-tech text-[13px] font-bold text-cyan-400 group-hover:underline line-clamp-1">
                    {source.title || 'Untitled source'}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-300 line-clamp-2">
                    {source.snippet || 'No snippet was returned.'}
                  </p>
                  <p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-slate-500">
                    <ExternalLink size={10} /> {domain}
                  </p>
                </a>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#090e1c] p-6 shadow-[0_0_30px_rgba(0,240,255,0.06)] text-white" data-testid="result-evidence">
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-cyan-400">
          <ClipboardCheck size={16} />
          <span>EVIDENCE</span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">VERIFIED SOURCE MATRIX</span>
      </div>

      <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {renderSourceList(officials, 'Official', <Check size={12} className="text-emerald-400" />, 'Government source')}
        {renderSourceList(supporting, 'Supporting', <span className="text-[14px] leading-none text-cyan-400">•</span>, 'Reputable source')}
        {renderSourceList(socials, 'Social', <span className="text-[14px] leading-none text-amber-400">•</span>, 'Supporting evidence only')}
      </div>
    </div>
  );
}

function StepCard({ number, title, copy }: { number: string; title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#090e1c] p-6 hover:border-cyan-500/30 transition-colors">
      <p className="font-mono text-[16px] font-bold text-cyan-400 tracking-wider">// {number}</p>
      <h3 className="mt-4 font-tech text-[20px] font-bold text-white tracking-wide">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{copy}</p>
    </div>
  );
}

function TrustRow({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="grid gap-2 py-5 sm:grid-cols-[0.7fr_1.3fr] sm:gap-8">
      <p className="font-tech text-[16px] font-bold text-white">{title}</p>
      <p className="text-[14px] leading-relaxed text-slate-300">{copy}</p>
    </div>
  );
}

function Faq({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="focus-ring flex w-full items-center justify-between gap-5 py-2 text-left font-tech text-[16px] font-bold text-white hover:text-cyan-300 transition-colors"
        aria-expanded={open}
        data-testid={`button-faq-${question.slice(0, 12).toLowerCase().replaceAll(' ', '-')}`}
      >
        <span>{question}</span>
        <ChevronDown size={18} className={`shrink-0 text-cyan-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-slate-300 pl-1" data-testid="text-faq-answer">
          {answer}
        </p>
      )}
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
