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
  CloudUpload,
  ExternalLink,
  FileImage,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Menu,
  Navigation,
  RotateCcw,
  ShieldCheck,
  Phone,
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

function CivicFixLogo({ className = "", iconSize = 28 }: { className?: string, iconSize?: number }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="CivicFix Logo">
        <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
        <path d="M16 8C12.134 8 9 11.134 9 15C9 20.25 16 26 16 26C16 26 23 20.25 23 15C23 11.134 19.866 8 16 8Z" stroke="hsl(var(--primary-foreground))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 15L15 17L19 13" stroke="hsl(var(--primary-foreground))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="text-[19px] font-bold tracking-tight text-[hsl(var(--foreground))]">CivicFix</span>
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
    setAnalysisStatus('Finding relevant civic information...');
    setAuthorityError('');
    const statusTimers = [
      window.setTimeout(() => setAnalysisStatus('Searching official sources...'), 400),
      window.setTimeout(() => setAnalysisStatus('Identifying likely authority...'), 900),
    ];
    try {
      const response = await fetch('/api/find-authority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_type: issueType, location: confirmedLocation, exact_location: exactLocation, location_source: locationSource, severity: analysis?.severity || 'medium', potential_hazard: analysis?.potential_hazard || '' }),
      });
      const payload = (await response.json()) as AuthorityResult | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Web intelligence is temporarily unavailable.');
      }
      setAuthorityResult(payload as AuthorityResult);
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
        setError(err.message || 'Unable to retrieve your location.');
        setIsLocating(false);
        setLocationMethod('manual');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const analyzeProblem = async () => {
    if (!file) {
      setError('Add a photo first so CivicFix can inspect the problem.');
      return;
    }
    if (!location.trim()) {
      setError('Add the problem location so the result has useful context.');
      document.getElementById('problem-location')?.focus();
      return;
    }
    setError('');
    setHasResult(false);
    setAnalysis(null);
    setAuthorityResult(null);
    setAuthorityError('');
    setIsAnalyzing(true);
    setAnalysisStatus('Uploading image...');
    const statusTimers = [
      window.setTimeout(() => setAnalysisStatus('Searching image with Google Lens...'), 700),
    ];
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/analyze-problem', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json()) as AnalysisResult | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Image analysis failed. Please try again.');
      }
      const analysisResult = payload as AnalysisResult;
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
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10" data-testid="header-navigation">
          <a href="#top" className="focus-ring rounded-md" data-testid="link-home">
            <CivicFixLogo />
          </a>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-flex items-center rounded-full bg-[hsl(var(--secondary))] px-3 py-1.5 text-[11px] font-bold tracking-wide text-[hsl(var(--secondary-foreground))] shadow-sm">AI Civic Assistant</span>
            <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} className="focus-ring rounded-lg p-2 md:hidden" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} data-testid="button-mobile-menu">
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </header>
        {mobileMenuOpen && (
          <nav className="mx-5 mb-3 flex flex-col gap-1 rounded-2xl border hairline bg-[hsl(var(--card))] p-2 shadow-[var(--shadow-soft)] md:hidden" aria-label="Mobile navigation" data-testid="mobile-navigation">
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold hover:bg-[hsl(var(--muted))]" data-testid="link-mobile-how-it-works">How it works</a>
            <a href="#why-civicfix" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold hover:bg-[hsl(var(--muted))]" data-testid="link-mobile-why-civicfix">Why CivicFix</a>
            <button type="button" onClick={scrollToReport} className="rounded-xl bg-[hsl(var(--secondary))] px-4 py-3 text-left text-sm font-semibold text-[hsl(var(--card))]" data-testid="button-mobile-start-report">Start a report</button>
          </nav>
        )}
        <section id="top" className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[0.91fr_1.09fr] lg:gap-16 lg:px-10 lg:pb-28 lg:pt-20">
          <div className="rise-in">
            <h1 className="max-w-[600px] text-balance text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-[hsl(var(--foreground))]">
              Turn civic problems into action.
            </h1>
             <p className="mt-6 max-w-[480px] text-[17px] leading-relaxed text-[hsl(var(--muted-foreground))]">
               Upload a photo. Identify the issue. Find the right authority. Generate a ready-to-report complaint.
             </p>
          </div>
          <div id="report" className="rise-in rise-in-delay scroll-mt-6">
            <div className="relative rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm sm:p-7">
              <div className="mb-6 flex items-start justify-between gap-4 px-1">
                <div>
                  <h2 className="text-[18px] font-bold tracking-tight text-[hsl(var(--foreground))]">Upload a civic issue</h2>
                  <p className="mt-1 text-[13px] text-[hsl(var(--muted-foreground))]">Roads, potholes, garbage, streetlights and more</p>
                </div> 
              </div>
              <div
                className={`upload-zone relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-5 py-6 text-center transition-all hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.02)] ${isDragging ? 'is-dragging border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.02)]' : ''}`}
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
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="sr-only" data-testid="input-photo" />
                {previewUrl ? (
                  <>
                    <img src={previewUrl} alt="Preview of the selected infrastructure problem" className="absolute inset-0 h-full w-full object-cover" data-testid="img-photo-preview" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10 text-white">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium drop-shadow-md" data-testid="text-photo-name">{file?.name}</p>
                      </div>
                      <button type="button" onClick={(event) => { event.stopPropagation(); removeFile(); }} className="focus-ring ml-3 shrink-0 rounded-md bg-white/20 p-1.5 backdrop-blur-md transition-colors hover:bg-white/30" aria-label="Remove selected photo" data-testid="button-remove-photo"><X size={16} /></button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--background))] text-[hsl(var(--primary))] shadow-sm"><FileImage size={24} strokeWidth={1.5} /></span>
                    <span className="inline-flex rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--primary-foreground))] shadow-sm">Choose photo</span>
                    <p className="mt-4 text-[12px] font-medium text-[hsl(var(--muted-foreground))]">JPG, PNG or WEBP · Max 500 KB</p>
                  </>
                )}
              </div>
              {file && (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="focus-ring mt-3 flex items-center gap-2 px-1 text-[12px] font-bold text-[hsl(var(--secondary))]" data-testid="button-replace-photo"><RotateCcw size={13} /> Replace photo</button>
              )}
              <label htmlFor="problem-location" className="mt-5 block text-[12px] font-bold text-[hsl(var(--foreground))]">Where is the problem?</label>
              <label htmlFor="problem-location" className="mt-8 block text-[15px] font-bold tracking-tight text-[hsl(var(--foreground))]">Where is the problem?</label>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => { setLocationMethod('gps'); requestLocation(); }}
                  className={`focus-ring flex-1 rounded-xl border py-3 text-[13px] font-medium transition-colors ${locationMethod === 'gps' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.5)]'}`}
                >
                  <span className="flex items-center justify-center gap-2">
                    {isLocating ? <LoaderCircle size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                    Use my current location
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => { setLocationMethod('manual'); setLocationSource('User provided'); setExactLocation(''); }}
                  className={`focus-ring flex-1 rounded-xl border py-3 text-[13px] font-medium transition-colors ${locationMethod === 'manual' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.5)]'}`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <MapPin size={16} /> Enter location manually
                  </span>
                </button>
              </div>

              {locationMethod === 'manual' ? (
                <div className="relative mt-4">
                  <input id="problem-location" type="text" value={location} onChange={(event) => { setLocation(event.target.value); setError(''); setLocationSource('User provided'); setExactLocation(''); }} placeholder="Enter city or area" className="focus-ring h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-[14px] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))]" data-testid="input-problem-location" />
                  {location && (
                    <p className="mt-2 text-[12px] text-[hsl(var(--muted-foreground))]">
                      ✓ Location: {location} <br/>User-provided · Exact location not provided
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-[13px] text-[hsl(var(--foreground))]">
                  {isLocating ? (
                    <span className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" /> Acquiring GPS signal...</span>
                  ) : location ? (
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-2 font-medium text-[hsl(var(--primary))]"><Check size={16} /> Location: {location}</span>
                      <span className="text-[hsl(var(--muted-foreground))]">GPS-provided · Exact location provided</span>
                    </span>
                  ) : (
                    'Location pending...'
                  )}
                </div>
              )}
              {error && <p className="mt-4 flex items-center gap-2 rounded-lg bg-[hsl(var(--destructive)/0.1)] p-3 text-[13px] font-semibold text-[hsl(var(--destructive))]" role="alert" data-testid="status-upload-error"><CircleAlert size={16} /> {error}</p>}
               <button type="button" onClick={analyzeProblem} disabled={isAnalyzing || isFindingAuthority} className="focus-ring mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-6 text-[15px] font-bold text-[hsl(var(--primary-foreground))] shadow-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-wait disabled:opacity-75" data-testid="button-analyze-problem">
                 {isAnalyzing || isFindingAuthority ? <><LoaderCircle size={18} className="animate-spin" /> {analysisStatus || 'Working…'}</> : <>Analyze Problem <ArrowRight size={18} /></>}
              </button>
                <p className="mt-4 text-center text-[12px] text-[hsl(var(--muted-foreground))]">Your photo is sent securely to SerpApi for image search and is not stored by CivicFix.</p>
            </div>
          </div>
        </section>

        {hasResult && (
          <section id="analysis-result" className="mx-auto max-w-7xl scroll-mt-8 px-5 pb-20 sm:px-8 lg:px-10" aria-live="polite">
            <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--secondary))] bg-[hsl(var(--secondary))] text-[hsl(var(--card))] shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-8 p-5 sm:p-8 lg:flex-row lg:gap-12 lg:p-10">
                <div className="lg:w-[34%]">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--accent))]"><Check size={15} /> 02 / Your starting point</div>
                   <h2 className="mt-5 text-[32px] font-bold leading-[0.98] tracking-[-0.05em] sm:text-[42px]">Here’s what we found.</h2>
                   <p className="mt-4 max-w-sm text-[13px] leading-6 text-[rgba(250,248,242,0.68)]">This result combines Google Lens image evidence with live web sources. It is not an official classification.</p>
                   <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--accent))]">Web intelligence powered by SerpApi</p>
                  <div className="mt-7 flex items-center gap-3 rounded-2xl border border-[rgba(250,248,242,0.16)] bg-[rgba(250,248,242,0.07)] p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--secondary))]"><FileImage size={19} /></div>
                      <div className="min-w-0"><p className="truncate text-[12px] font-bold" data-testid="text-result-file">{file?.name}</p><p className="text-[11px] text-[rgba(250,248,242,0.58)]">Photo searched with Google Lens</p></div>
                  </div>
                </div>
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                   <div className="rounded-2xl bg-[hsl(var(--card))] p-5 text-[hsl(var(--foreground))] sm:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">PROBLEM DETECTED</p><span className="flex items-center gap-1.5 rounded-full bg-[rgba(228,87,53,0.1)] px-3 py-1 text-[11px] font-bold text-[hsl(var(--primary))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" /> Lens evidence · not official</span></div>
                      <div className="mt-4 flex flex-wrap items-end justify-between gap-5"><div><p className="text-[32px] font-bold capitalize tracking-[-0.05em]" data-testid="result-problem-type">{analysis?.issue_type}</p></div><div className="text-left sm:text-right"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">SEVERITY</p><p className="mt-1 text-[20px] font-bold capitalize text-[hsl(var(--primary))]" data-testid="result-severity">{displaySeverity(analysis)}</p></div></div>
                  </div>
                    <div className="rounded-2xl bg-[rgba(250,248,242,0.1)] p-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgba(250,248,242,0.56)]">LOCATION</p>
                      <p className="mt-3 flex items-start gap-2 text-[17px] font-bold leading-6" data-testid="result-location">
                        <MapPin size={18} className="mt-1 shrink-0 text-[hsl(var(--accent))]" />
                        {location}
                      </p>
                      <p className="mt-3 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]" data-testid="result-exact-location">
                        <span className="font-bold text-[hsl(var(--foreground))]">Exact location:</span> {exactLocation ? <span className="text-[hsl(var(--primary))] font-medium">Available</span> : 'Not provided'}<br/>
                        <span className="font-bold text-[hsl(var(--foreground))]">Source:</span> {locationSource || 'User provided'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[hsl(var(--primary)/0.05)] p-5 border border-[hsl(var(--border))]"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">POTENTIAL HAZARD</p><p className="mt-3 text-[15px] font-bold leading-6" data-testid="result-hazard">{analysis?.potential_hazard}</p></div>
                    <div className="rounded-2xl bg-[hsl(var(--card))] p-5 text-[hsl(var(--foreground))] sm:col-span-2 border border-[hsl(var(--border))]"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">DESCRIPTION</p><p className="mt-3 max-w-2xl text-[15px] leading-7" data-testid="result-description">{analysis?.description}</p></div>
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                      <AuthorityCard result={authorityResult} isLoading={isFindingAuthority} error={authorityError} location={location} exactLocation={exactLocation} />
                      <div className="grid gap-3">
                        <EvidenceCard result={authorityResult} isLoading={isFindingAuthority} error={authorityError} />
                        <ComplaintCard result={authorityResult} isLoading={isFindingAuthority} error={authorityError} />
                      </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <section id="how-it-works" className="border-y hairline bg-[rgba(235,230,216,0.4)] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24">
            <div className="rise-in"><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--primary))]">A small action, made clearer</p><h2 className="mt-4 max-w-md text-[42px] leading-[0.98] tracking-[-0.055em] sm:text-[58px]">From “someone should fix this” to a useful next step.</h2><p className="mt-6 max-w-sm text-[15px] leading-7 text-[hsl(var(--muted-foreground))]">You notice the issue. CivicFix helps put shape around it, so the right conversation can start with better information.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <StepCard number="01" title="Capture the issue" copy="Take a straightforward photo that shows the problem in context." />
              <StepCard number="02" title="Add the place" copy="Tell us where it is. A street, landmark, or neighborhood is enough to begin." />
              <StepCard number="03" title="Understand the result" copy="Get plain-language context about the issue, risk, and what a report could include." />
              <div className="relative overflow-hidden rounded-[22px] bg-[hsl(var(--accent))] p-6 sm:col-span-2 sm:flex sm:items-end sm:justify-between sm:gap-8">
                <div><p className="text-[11px] font-bold uppercase tracking-[0.17em] text-[hsl(var(--secondary))]">The point</p><p className="mt-3 max-w-md text-[23px] font-bold leading-tight tracking-[-0.04em] text-[hsl(var(--secondary))]">Better reports begin with people who pay attention.</p></div>
                <div className="mt-8 hidden h-20 w-20 shrink-0 rounded-full border border-[rgba(42,70,64,0.24)] sm:block" aria-hidden="true"><div className="m-4 h-12 w-12 rounded-full border border-[rgba(42,70,64,0.24)]" /></div>
              </div>
            </div>
          </div>
        </section>

        <section id="why-civicfix" className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:px-10 lg:py-28">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--primary))]">Designed for trust</p>
            <h2 className="mt-4 max-w-2xl text-[42px] leading-[0.98] tracking-[-0.055em] sm:text-[59px]">Useful, without pretending to be the government.</h2>
            <div className="mt-10 divide-y hairline border-y">
              <TrustRow title="Plain language" copy="No technical fog. Just a practical description you can understand and reuse." />
              <TrustRow title="Clear limits" copy="Demo results are labeled as examples. We never turn a guess into an official answer." />
              <TrustRow title="Respect for your time" copy="No account, no complicated form, and no need to know the right department first." />
            </div>
          </div>
          <div className="relative flex min-h-[320px] items-end overflow-hidden rounded-[26px] bg-[hsl(var(--secondary))] p-7 text-[hsl(var(--card))] sm:min-h-[390px] sm:p-9">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-[rgba(250,248,242,0.18)]" aria-hidden="true"><div className="m-8 h-40 w-40 rounded-full border border-[rgba(250,248,242,0.18)]"><div className="m-8 h-24 w-24 rounded-full bg-[hsl(var(--accent))]" /></div></div>
            <div className="relative"><ShieldCheck size={29} className="text-[hsl(var(--accent))]" /><p className="mt-9 max-w-sm text-[27px] font-bold leading-[1.05] tracking-[-0.045em]">Your neighborhood is full of signals. CivicFix helps make them legible.</p><p className="mt-5 text-[12px] leading-5 text-[rgba(250,248,242,0.61)]">A presentation prototype for a more informed civic life.</p></div>
          </div>
        </section>

        <section id="faq" className="border-t hairline px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-3xl"><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--primary))]">Questions, answered</p><h2 className="mt-4 text-[42px] tracking-[-0.055em] sm:text-[55px]">Before you report</h2><div className="mt-9"><Faq question="Do I need to know which department is responsible?" answer="No. That is part of the work CivicFix is designed to help with. Start with what you can see and where you found it." /><Faq question="Is this already connected to a government complaint system?" answer="Not yet. This experience is a guided demo, so authority and complaint details are intentionally shown as placeholders rather than external data." /><Faq question="What makes a good photo?" answer="Stand far enough back to show context, then include a closer view of the issue. Avoid faces, vehicle plates, and anything personally identifying." /></div></div>
        </section>

        <footer className="border-t hairline bg-[hsl(var(--card))] px-5 py-9 text-[hsl(var(--foreground))] sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><CivicFixLogo iconSize={24} className="opacity-90" /><p className="text-[12px] text-[hsl(var(--muted-foreground))]">Make the visible problems easier to act on.</p><p className="text-[11px] text-[hsl(var(--muted-foreground))]">Prototype · 2026</p></div>
        </footer>
      </div>
    </main>
  );
}

function AuthorityCard({ result, isLoading, error, location, exactLocation }: { result: AuthorityResult | null; isLoading: boolean; error: string, location: string, exactLocation: string }) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ShieldCheck size={18} /><p className="text-[12px] font-bold">POTENTIAL AUTHORITY</p></div>
        <p className="mt-4 flex items-center gap-2 text-[13px] leading-5 text-[hsl(var(--muted-foreground))]"><LoaderCircle size={16} className="animate-spin" /> Checking official sources…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ShieldCheck size={18} /><p className="text-[12px] font-bold">POTENTIAL AUTHORITY</p></div>
        <p className="mt-4 text-[13px] leading-5 text-[hsl(var(--muted-foreground))]">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ShieldCheck size={18} /><p className="text-[12px] font-bold">POTENTIAL AUTHORITY</p></div>
        <p className="mt-4 text-[13px] leading-5 text-[hsl(var(--muted-foreground))]">Waiting for web intelligence…</p>
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
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)] text-[hsl(var(--foreground))]" data-testid="result-authority">
      <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ShieldCheck size={18} /><p className="text-[12px] font-bold">POTENTIAL AUTHORITY</p></div>
      
      <p className="mt-4 text-[22px] font-bold leading-7 tracking-tight" data-testid="result-authority-name">{result.authority_name || 'Authority not available'}</p>
      
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]" data-testid="result-authority-confidence">
        Evidence strength: {mapConfidence(result.authority_confidence || 'low')}
      </span>

      <div className="mt-6 border-t border-[hsl(var(--border))] pt-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">WHY THIS AUTHORITY?</p>
        <p className="mt-2 text-[13px] leading-6 text-[hsl(var(--foreground))]" data-testid="result-authority-reason">{result.authority_reason || 'No reason was returned.'}</p>
      </div>

      <div className="mt-6 border-t border-[hsl(var(--border))] pt-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">WHAT WOULD CHANGE THIS RESULT?</p>
        <p className="mt-2 text-[13px] leading-6 text-[hsl(var(--foreground))]">Exact road jurisdiction cannot be confirmed because the user provided {location} but not the specific street, landmark, road number, or GPS location.</p>
      </div>

      <div className="mt-6 border-t border-[hsl(var(--border))] pt-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">REPORTING CHANNEL</p>
        {result.official_source_url ? (
          <a href={result.official_source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[hsl(var(--primary))] hover:underline" data-testid="result-complaint-url">
            {result.official_source_url.toLowerCase().includes('grievance') ? 'General government grievance channel' : 'Verified official reporting channel'} <ExternalLink size={14} />
          </a>
        ) : (
          <p className="mt-2 text-[13px] leading-6 text-[hsl(var(--muted-foreground))]">No official complaint URL found.</p>
        )}
      </div>

      {contacts.length > 0 && (
        <div className="mt-6 border-t border-[hsl(var(--border))] pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">OFFICIAL CONTACT</p>
          <ul className="mt-3 space-y-4">
            {contacts.map((contact, i) => (
              <li key={i} className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold text-[hsl(var(--foreground))]"><Phone size={16} className="text-[hsl(var(--muted-foreground))]" /> {contact}</span>
                <span className="flex items-center gap-1 text-[11px] text-[hsl(var(--primary))] font-medium"><Check size={12} /> Verified from official source</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ComplaintCard({ result, isLoading, error }: { result: AuthorityResult | null; isLoading: boolean; error: string }) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ArrowDownRight size={18} /><p className="text-[12px] font-bold">COMPLAINT DRAFT</p></div>
        <p className="mt-4 flex items-center gap-2 text-[13px] leading-5 text-[hsl(var(--muted-foreground))]"><LoaderCircle size={16} className="animate-spin" /> Generating complaint draft…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ArrowDownRight size={18} /><p className="text-[12px] font-bold">COMPLAINT DRAFT</p></div>
        <p className="mt-4 text-[13px] leading-5 text-[hsl(var(--muted-foreground))]">Could not generate a complaint due to an error.</p>
      </div>
    );
  }

  if (!result?.generated_complaint) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ArrowDownRight size={18} /><p className="text-[12px] font-bold">COMPLAINT DRAFT</p></div>
        <p className="mt-4 text-[13px] leading-5 text-[hsl(var(--muted-foreground))]">The AI-generated complaint will appear here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)]" data-testid="result-complaint">
      <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ArrowDownRight size={18} /><p className="text-[12px] font-bold">COMPLAINT DRAFT</p></div>
      <div className="mt-4 rounded-xl bg-[hsl(var(--muted))] p-4">
        <p className="whitespace-pre-wrap text-[13px] leading-6 text-[hsl(var(--foreground))] font-mono">{result.generated_complaint}</p>
      </div>
    </div>
  );
}

function EvidenceCard({ result, isLoading, error }: { result: AuthorityResult | null; isLoading: boolean; error: string }) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ClipboardCheck size={18} /><p className="text-[12px] font-bold">EVIDENCE</p></div>
        <p className="mt-4 flex items-center gap-2 text-[13px] leading-5 text-[hsl(var(--muted-foreground))]"><LoaderCircle size={16} className="animate-spin" /> Collecting supporting sources…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ClipboardCheck size={18} /><p className="text-[12px] font-bold">EVIDENCE</p></div>
        <p className="mt-4 text-[13px] leading-5 text-[hsl(var(--muted-foreground))]">No sources available because the web lookup failed.</p>
      </div>
    );
  }

  if (!result?.supporting_sources?.length) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-[hsl(var(--primary))]"><ClipboardCheck size={18} /><p className="text-[12px] font-bold">EVIDENCE</p></div>
        <p className="mt-4 text-[13px] leading-5 text-[hsl(var(--muted-foreground))]">No supporting sources were returned.</p>
      </div>
    );
  }

  const officials = result.supporting_sources.filter(s => s.url.includes('.gov') || s.url.includes('nic.in') || s.url.includes('municipal'));
  const socials = result.supporting_sources.filter(s => s.url.includes('facebook.com') || s.url.includes('twitter.com') || s.url.includes('x.com') || s.url.includes('instagram.com'));
  const supporting = result.supporting_sources.filter(s => !officials.includes(s) && !socials.includes(s));

  const renderSourceList = (sources: typeof result.supporting_sources, label: string, icon: ReactNode, desc: string) => {
    if (sources.length === 0) return null;
    return (
      <div className="mb-6 last:mb-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1 flex items-center gap-1.5">{label}</p>
        <p className="text-[11px] text-[hsl(var(--primary))] font-medium mb-3 flex items-center gap-1">{icon} {desc}</p>
        <div className="space-y-4">
          {sources.map((source) => {
            const domain = new URL(source.url).hostname.replace('www.', '');
            return (
              <div key={source.url} className="group relative">
                <a href={source.url} target="_blank" rel="noreferrer" className="block outline-none">
                  <p className="text-[13px] font-bold leading-5 text-[hsl(var(--primary))] group-hover:underline">{source.title || 'Untitled source'}</p>
                  <p className="mt-1 text-[12px] leading-5 text-[hsl(var(--foreground))] line-clamp-2">{source.snippet || 'No snippet was returned.'}</p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]"><ExternalLink size={10} /> {domain}</p>
                </a>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-soft)] text-[hsl(var(--foreground))]" data-testid="result-evidence">
      <div className="flex items-center gap-2 text-[hsl(var(--primary))] mb-5"><ClipboardCheck size={18} /><p className="text-[12px] font-bold">EVIDENCE</p></div>
      
      <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {renderSourceList(officials, 'Official', <Check size={12} />, 'Government source')}
        {renderSourceList(supporting, 'Supporting', <span className="text-[16px] leading-none">•</span>, 'Reputable source')}
        {renderSourceList(socials, 'Social', <span className="text-[16px] leading-none">•</span>, 'Supporting evidence only')}
      </div>
    </div>
  );
}

function PlaceholderCard({ icon, title, copy, testId }: { icon: ReactNode; title: string; copy: string; testId: string }) {
  return <div className="rounded-2xl border border-[rgba(250,248,242,0.16)] bg-[rgba(250,248,242,0.07)] p-4" data-testid={testId}><div className="flex items-center gap-2 text-[hsl(var(--accent))]">{icon}<p className="text-[12px] font-bold">{title}</p></div><p className="mt-3 text-[11px] leading-5 text-[rgba(250,248,242,0.55)]">{copy}</p><span className="mt-3 inline-flex rounded-full border border-[rgba(250,248,242,0.16)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[rgba(250,248,242,0.4)]">Coming later</span></div>;
}

function StepCard({ number, title, copy }: { number: string; title: string; copy: string }) {
  return <div className="rounded-[22px] border hairline bg-[hsl(var(--card))] p-6 shadow-[var(--shadow-soft)]"><p className="font-display text-[30px] italic text-[hsl(var(--primary))]">{number}</p><h3 className="mt-8 text-[19px] font-bold tracking-[-0.035em]">{title}</h3><p className="mt-3 text-[13px] leading-6 text-[hsl(var(--muted-foreground))]">{copy}</p></div>;
}

function TrustRow({ title, copy }: { title: string; copy: string }) {
  return <div className="grid gap-2 py-5 sm:grid-cols-[0.7fr_1.3fr] sm:gap-8"><p className="text-[14px] font-bold">{title}</p><p className="text-[14px] leading-6 text-[hsl(var(--muted-foreground))]">{copy}</p></div>;
}

function Faq({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return <div className="border-b hairline"><button type="button" onClick={() => setOpen((value) => !value)} className="focus-ring flex w-full items-center justify-between gap-5 py-5 text-left text-[15px] font-bold" aria-expanded={open} data-testid={`button-faq-${question.slice(0, 12).toLowerCase().replaceAll(' ', '-')}`}>{question}<ChevronDown size={18} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} /></button>{open && <p className="max-w-2xl pb-5 pr-8 text-[14px] leading-6 text-[hsl(var(--muted-foreground))]" data-testid="text-faq-answer">{answer}</p>}</div>;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
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
