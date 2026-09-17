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
  MapPin,
  Menu,
  RotateCcw,
  ShieldCheck,
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
  likely_authority: string;
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
  official_reporting_url: string;
  contact_information: string;
  supporting_sources: AuthoritySource[];
};

function readFileAsBase64(nextFile: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('The image could not be read.'));
        return;
      }
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(nextFile);
  });
}

function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [location, setLocation] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [authorityResult, setAuthorityResult] = useState<AuthorityResult | null>(null);
  const [isFindingAuthority, setIsFindingAuthority] = useState(false);
  const [authorityError, setAuthorityError] = useState('');
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
    const accepted = ['image/jpeg', 'image/png', 'image/webp'];
    if (!accepted.includes(nextFile.type)) {
      setError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError('That image is larger than 10 MB. Try a smaller photo.');
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
    setError('');
  };

  const findAuthority = async (issueType: string, confirmedLocation: string) => {
    setIsFindingAuthority(true);
    setAuthorityError('');
    try {
      const response = await fetch('/api/find-authority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_type: issueType, location: confirmedLocation }),
      });
      const payload = (await response.json()) as AuthorityResult | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Web intelligence is temporarily unavailable.');
      }
      setAuthorityResult(payload as AuthorityResult);
    } catch (authorityLookupError) {
      setAuthorityError(authorityLookupError instanceof Error ? authorityLookupError.message : 'Web intelligence is temporarily unavailable.');
    } finally {
      setIsFindingAuthority(false);
    }
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
    try {
      const imageBase64 = await readFileAsBase64(file);
      const response = await fetch('/api/analyze-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type, imageBase64 }),
      });
      const payload = (await response.json()) as AnalysisResult | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Image analysis failed. Please try again.');
      }
      const analysisResult = payload as AnalysisResult;
      setAnalysis(analysisResult);
      setIsAnalyzing(false);
      setHasResult(true);
      void findAuthority(analysisResult.issue_type, location.trim());
      window.setTimeout(() => document.getElementById('analysis-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (analysisError) {
      setIsAnalyzing(false);
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
          <a href="#top" className="focus-ring flex items-center gap-3 rounded-md" data-testid="link-home">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[hsl(var(--secondary))] text-[hsl(var(--accent))] shadow-[0_5px_0_hsl(203_35%_17%)]" aria-hidden="true">
              <span className="text-lg font-bold">C</span>
            </span>
            <span className="text-[17px] font-bold tracking-[-0.03em]">CivicFix</span>
          </a>
          <nav className="hidden items-center gap-8 text-[13px] font-semibold text-[hsl(var(--muted-foreground))] md:flex" aria-label="Main navigation">
            <a className="focus-ring rounded-md transition-colors hover:text-[hsl(var(--foreground))]" href="#how-it-works" data-testid="link-how-it-works">How it works</a>
            <a className="focus-ring rounded-md transition-colors hover:text-[hsl(var(--foreground))]" href="#why-civicfix" data-testid="link-why-civicfix">Why CivicFix</a>
            <a className="focus-ring rounded-md transition-colors hover:text-[hsl(var(--foreground))]" href="#faq" data-testid="link-faq">Questions</a>
            <button type="button" onClick={scrollToReport} className="focus-ring rounded-full bg-[hsl(var(--secondary))] px-5 py-2.5 text-[13px] font-bold text-[hsl(var(--card))] transition-transform hover:-translate-y-0.5 active:translate-y-0" data-testid="button-start-report">Start a report</button>
          </nav>
          <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} className="focus-ring rounded-lg p-2 md:hidden" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} data-testid="button-mobile-menu">
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </header>
        {mobileMenuOpen && (
          <nav className="mx-5 mb-3 flex flex-col gap-1 rounded-2xl border hairline bg-[hsl(var(--card))] p-2 shadow-[var(--shadow-soft)] md:hidden" aria-label="Mobile navigation" data-testid="mobile-navigation">
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold hover:bg-[hsl(var(--muted))]" data-testid="link-mobile-how-it-works">How it works</a>
            <a href="#why-civicfix" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold hover:bg-[hsl(var(--muted))]" data-testid="link-mobile-why-civicfix">Why CivicFix</a>
            <button type="button" onClick={scrollToReport} className="rounded-xl bg-[hsl(var(--secondary))] px-4 py-3 text-left text-sm font-semibold text-[hsl(var(--card))]" data-testid="button-mobile-start-report">Start a report</button>
          </nav>
        )}

        <section id="top" className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[0.91fr_1.09fr] lg:gap-16 lg:px-10 lg:pb-28 lg:pt-24">
          <div className="rise-in">
            <div className="mb-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--primary))]">
              <span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
              A clearer way to care for your street
            </div>
            <h1 className="max-w-[600px] text-balance text-[clamp(3.4rem,8vw,6.5rem)] leading-[0.88] tracking-[-0.065em] text-[hsl(var(--foreground))]">
              See a problem.<br /><span className="font-display italic text-[hsl(var(--primary))]">Find who can fix it.</span>
            </h1>
             <p className="mt-7 max-w-[480px] text-[16px] leading-7 text-[hsl(var(--muted-foreground))] sm:text-[18px]">
               CivicFix uses AI and web intelligence to help identify civic problems and find the appropriate reporting authority.
             </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-[12px] font-semibold text-[hsl(var(--muted-foreground))]">
              <span className="flex items-center gap-2"><ShieldCheck size={16} className="text-[hsl(var(--secondary))]" /> Built for everyday citizens</span>
              <span className="hidden h-1 w-1 rounded-full bg-[hsl(var(--border))] sm:block" />
              <span>No account needed</span>
            </div>
          </div>
          <div id="report" className="rise-in rise-in-delay scroll-mt-6">
            <div className="relative rounded-[27px] border border-[rgba(60,76,67,0.14)] bg-[hsl(var(--card))] p-4 shadow-[var(--shadow-card)] sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4 px-1">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">01 / Start here</p>
                  <h2 className="mt-1 text-[23px] font-bold tracking-[-0.04em]">Show us what you found</h2>
                </div>
                 <div className="rounded-full bg-[hsl(var(--accent))] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[hsl(var(--accent-foreground))]">AI analysis</div>
              </div>
              <div
                className={`upload-zone relative flex min-h-[218px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[19px] border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] px-5 py-6 text-center ${isDragging ? 'is-dragging' : ''}`}
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
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-[rgba(27,43,38,0.88)] px-4 py-3 text-left text-[hsl(var(--card))]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold" data-testid="text-photo-name">{file?.name}</p>
                        <p className="text-[11px] text-[rgba(250,248,242,0.68)]">Ready to inspect</p>
                      </div>
                      <button type="button" onClick={(event) => { event.stopPropagation(); removeFile(); }} className="focus-ring ml-3 shrink-0 rounded-lg border border-[rgba(250,248,242,0.3)] p-2 transition-colors hover:bg-[rgba(250,248,242,0.12)]" aria-label="Remove selected photo" data-testid="button-remove-photo"><X size={17} /></button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--accent))] text-[hsl(var(--secondary))]"><CloudUpload size={25} strokeWidth={1.8} /></span>
                    <p className="text-[15px] font-bold">Drop a photo here</p>
                    <p className="mt-1 text-[13px] text-[hsl(var(--muted-foreground))]">or <span className="font-bold text-[hsl(var(--primary))]">browse from your phone</span></p>
                    <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">JPG, PNG or WebP · max 10 MB</p>
                  </>
                )}
              </div>
              {file && (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="focus-ring mt-3 flex items-center gap-2 px-1 text-[12px] font-bold text-[hsl(var(--secondary))]" data-testid="button-replace-photo"><RotateCcw size={13} /> Replace photo</button>
              )}
              <label htmlFor="problem-location" className="mt-5 block text-[12px] font-bold text-[hsl(var(--foreground))]">Where is the problem?</label>
              <div className="relative mt-2">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" size={18} />
                <input id="problem-location" type="text" value={location} onChange={(event) => { setLocation(event.target.value); setError(''); }} placeholder="Enter the problem location" className="focus-ring h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] pl-11 pr-4 text-[14px] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))]" data-testid="input-problem-location" />
              </div>
              {error && <p className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-[hsl(var(--destructive))]" role="alert" data-testid="status-upload-error"><CircleAlert size={15} /> {error}</p>}
              <button type="button" onClick={analyzeProblem} disabled={isAnalyzing} className="focus-ring mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 text-[14px] font-bold text-[hsl(var(--primary-foreground))] shadow-[0_4px_0_hsl(14_79%_39%)] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-wait disabled:opacity-75" data-testid="button-analyze-problem">
                {isAnalyzing ? <><LoaderCircle size={18} className="animate-spin" /> Reading your photo…</> : <>Analyze Problem <ArrowRight size={17} /></>}
              </button>
               <p className="mt-3 text-center text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Your photo is sent securely for analysis and is not stored by CivicFix.</p>
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
                   <p className="mt-4 max-w-sm text-[13px] leading-6 text-[rgba(250,248,242,0.68)]">This AI analysis is based only on what is visibly supported by your image. It is an estimate, not an official classification.</p>
                   <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--accent))]">Web intelligence powered by SerpApi</p>
                  <div className="mt-7 flex items-center gap-3 rounded-2xl border border-[rgba(250,248,242,0.16)] bg-[rgba(250,248,242,0.07)] p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--secondary))]"><FileImage size={19} /></div>
                     <div className="min-w-0"><p className="truncate text-[12px] font-bold" data-testid="text-result-file">{file?.name}</p><p className="text-[11px] text-[rgba(250,248,242,0.58)]">Photo reviewed by CivicFix AI</p></div>
                  </div>
                </div>
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                   <div className="rounded-2xl bg-[hsl(var(--card))] p-5 text-[hsl(var(--foreground))] sm:col-span-2">
                     <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]">PROBLEM DETECTED</p><span className="flex items-center gap-1.5 rounded-full bg-[rgba(228,87,53,0.1)] px-3 py-1 text-[11px] font-bold text-[hsl(var(--primary))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" /> AI estimate · not official</span></div>
                     <div className="mt-4 flex flex-wrap items-end justify-between gap-5"><div><p className="text-[32px] font-bold capitalize tracking-[-0.05em]" data-testid="result-problem-type">{analysis?.issue_type}</p></div><div className="text-left sm:text-right"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">SEVERITY</p><p className="mt-1 text-[20px] font-bold capitalize text-[hsl(var(--primary))]" data-testid="result-severity">{analysis?.severity}</p></div></div>
                  </div>
                    <div className="rounded-2xl bg-[rgba(250,248,242,0.1)] p-5"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgba(250,248,242,0.56)]">LOCATION</p><p className="mt-3 flex items-start gap-2 text-[17px] font-bold leading-6" data-testid="result-location"><MapPin size={18} className="mt-1 shrink-0 text-[hsl(var(--accent))]" />{location}</p></div>
                    <div className="rounded-2xl bg-[rgba(250,248,242,0.1)] p-5"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgba(250,248,242,0.56)]">POTENTIAL HAZARD</p><p className="mt-3 text-[15px] font-bold leading-6" data-testid="result-hazard">{analysis?.potential_hazard}</p></div>
                    <div className="rounded-2xl bg-[hsl(var(--card))] p-5 text-[hsl(var(--foreground))] sm:col-span-2"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">DESCRIPTION</p><p className="mt-3 max-w-2xl text-[15px] leading-7" data-testid="result-description">{analysis?.description}</p></div>
                    <div className="rounded-2xl bg-[rgba(250,248,242,0.1)] p-5 sm:col-span-2"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgba(250,248,242,0.56)]">VISUAL CONFIDENCE</p><p className="mt-3 text-[24px] font-bold" data-testid="result-visual-confidence">{analysis?.visual_confidence}%</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(250,248,242,0.14)]"><div className="h-full rounded-full bg-[hsl(var(--accent))] transition-[width] duration-500" style={{ width: `${analysis?.visual_confidence ?? 0}%` }} /></div></div>
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
                      <AuthorityCard result={authorityResult} isLoading={isFindingAuthority} error={authorityError} />
                      <EvidenceCard result={authorityResult} isLoading={isFindingAuthority} error={authorityError} />
                     <PlaceholderCard icon={<ArrowDownRight size={18} />} title="COMPLAINT" copy="The AI-generated complaint will appear here." testId="result-complaint" />
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

        <footer className="border-t hairline bg-[hsl(var(--secondary))] px-5 py-9 text-[hsl(var(--card))] sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[hsl(var(--accent))] text-[hsl(var(--secondary))] text-sm font-bold">C</span><span className="font-bold tracking-[-0.03em]">CivicFix</span></div><p className="text-[12px] text-[rgba(250,248,242,0.55)]">Make the visible problems easier to act on.</p><p className="text-[11px] text-[rgba(250,248,242,0.4)]">Prototype · 2024</p></div>
        </footer>
      </div>
    </main>
  );
}

function AuthorityCard({ result, isLoading, error }: { result: AuthorityResult | null; isLoading: boolean; error: string }) {
  return (
    <div className="rounded-2xl border border-[rgba(250,248,242,0.16)] bg-[rgba(250,248,242,0.07)] p-4" data-testid="result-authority">
      <div className="flex items-center gap-2 text-[hsl(var(--accent))]"><ShieldCheck size={18} /><p className="text-[12px] font-bold">LIKELY AUTHORITY</p></div>
      {isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-[11px] leading-5 text-[rgba(250,248,242,0.55)]"><LoaderCircle size={14} className="animate-spin" /> Checking official sources…</p>
      ) : error ? (
        <p className="mt-3 text-[11px] leading-5 text-[rgba(250,248,242,0.55)]">{error}</p>
      ) : result ? (
        <>
          <p className="mt-3 text-[16px] font-bold leading-5" data-testid="result-authority-name">{result.likely_authority || 'Authority not available'}</p>
          <span className="mt-3 inline-flex rounded-full border border-[rgba(250,248,242,0.16)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[hsl(var(--accent))]" data-testid="result-authority-confidence">{result.confidence || 'low'} confidence</span>
          <p className="mt-3 text-[11px] leading-5 text-[rgba(250,248,242,0.55)]" data-testid="result-authority-reason">{result.explanation || 'No reason was returned.'}</p>
          {result.official_reporting_url ? (
            <a href={result.official_reporting_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[hsl(var(--accent))] hover:underline" data-testid="result-complaint-url">Official reporting channel <ExternalLink size={12} /></a>
          ) : (
            <p className="mt-3 text-[11px] leading-5 text-[rgba(250,248,242,0.45)]">No official complaint URL found.</p>
          )}
          <p className="mt-3 text-[11px] leading-5 text-[rgba(250,248,242,0.55)]" data-testid="result-contact-information">{result.contact_information || 'No official contact information was found.'}</p>
        </>
      ) : (
        <p className="mt-3 text-[11px] leading-5 text-[rgba(250,248,242,0.55)]">Waiting for web intelligence…</p>
      )}
    </div>
  );
}

function EvidenceCard({ result, isLoading, error }: { result: AuthorityResult | null; isLoading: boolean; error: string }) {
  return (
    <div className="rounded-2xl border border-[rgba(250,248,242,0.16)] bg-[rgba(250,248,242,0.07)] p-4" data-testid="result-evidence">
      <div className="flex items-center gap-2 text-[hsl(var(--accent))]"><ClipboardCheck size={18} /><p className="text-[12px] font-bold">EVIDENCE</p></div>
      {isLoading ? (
        <p className="mt-3 text-[11px] leading-5 text-[rgba(250,248,242,0.55)]">Collecting supporting sources…</p>
      ) : error ? (
        <p className="mt-3 text-[11px] leading-5 text-[rgba(250,248,242,0.55)]">No sources available because the web lookup failed.</p>
      ) : result?.supporting_sources?.length ? (
        <div className="mt-3 max-h-52 space-y-3 overflow-y-auto pr-1">
          {result.supporting_sources.map((source) => (
            <div key={source.url} className="border-b border-[rgba(250,248,242,0.1)] pb-3 last:border-0 last:pb-0">
              <a href={source.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-2 text-[11px] font-bold leading-4 text-[hsl(var(--accent))] hover:underline">
                <span>{source.title || 'Untitled source'}</span><ExternalLink size={12} className="mt-0.5 shrink-0" />
              </a>
              <p className="mt-1 text-[10px] leading-4 text-[rgba(250,248,242,0.55)]">{source.snippet || 'No snippet was returned.'}</p>
              <p className="mt-1 break-all text-[9px] leading-3 text-[rgba(250,248,242,0.35)]">{source.url}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[11px] leading-5 text-[rgba(250,248,242,0.55)]">No supporting sources were returned.</p>
      )}
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
