import React, { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  FileText, 
  Search, 
  Copy, 
  Check, 
  ExternalLink, 
  Sparkles, 
  Calendar, 
  Layers, 
  Info,
  Maximize2,
  RotateCw,
  RefreshCw,
  ChevronRight,
  PackageCheck
} from 'lucide-react';
import { 
  PrintRequest, 
  FilamentItem, 
  ModelDimensions, 
  RequestStatus, 
  Booking, 
  PrinterStatus 
} from '../types';
import { ModelViewer } from './ModelViewer';
import { 
  parseModelFile, 
  ModelAnalysisResult, 
  BAMBU_A1_MINI_LIMITS,
  estimatePrintTimeMinutes 
} from '../utils/modelParser';
import { 
  createPrintRequest, 
  getRequestByTrackingCode, 
  resubmitRevisedModel, 
  recordBlockedOversizeAttempt 
} from '../services/firebaseService';

interface StudentPortalProps {
  initialTab?: 'submit' | 'my-requests' | 'schedule';
  filaments: FilamentItem[];
  bookings: Booking[];
  printerStatus: PrinterStatus | null;
  allRequests: PrintRequest[];
  onViewRequestDetail?: (trackingCode: string) => void;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({
  initialTab = 'submit',
  filaments,
  bookings,
  printerStatus,
  allRequests,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'submit' | 'my-requests' | 'schedule'>(initialTab);

  // Synchronize when parent tab changes
  useEffect(() => {
    setActiveSubTab(initialTab);
  }, [initialTab]);

  // Form State
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('Grade 7');
  const [section, setSection] = useState('7-A');
  const [email, setEmail] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState('PLA');
  const [color, setColor] = useState('');
  const [infill, setInfill] = useState(15);
  const [quantity, setQuantity] = useState(1);
  const [preferredWindow, setPreferredWindow] = useState('This week (flexible)');

  // File & 3D Model State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [modelResult, setModelResult] = useState<ModelAnalysisResult | null>(null);
  const [modelScale, setModelScale] = useState(1);
  const [modelRotation, setModelRotation] = useState({ x: 0, y: 0, z: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<PrintRequest | null>(null);

  // My Requests & Lookup State
  const [savedTrackingCodes, setSavedTrackingCodes] = useState<string[]>([]);
  const [lookupCode, setLookupCode] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState<PrintRequest | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Revised Model Resubmission State
  const [revisingRequestId, setRevisingRequestId] = useState<string | null>(null);
  const [revisedFile, setRevisedFile] = useState<File | null>(null);
  const [revisedModelResult, setRevisedModelResult] = useState<ModelAnalysisResult | null>(null);
  const [isResubmitting, setIsResubmitting] = useState(false);

  // Load saved tracking codes from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('printlab_my_tracking_codes') || '[]');
      if (Array.isArray(stored)) {
        setSavedTrackingCodes(stored);
      }
    } catch {
      // ignore
    }
  }, [submittedRequest]);

  // Filter available materials from inventory
  const availableMaterials = useMemo(() => {
    const set = new Set<string>();
    filaments.forEach((f) => {
      if (f.isAvailable && f.stockGrams > 0) {
        set.add(f.material);
      }
    });
    return Array.from(set).length > 0 ? Array.from(set) : ['PLA', 'PETG', 'TPU'];
  }, [filaments]);

  // Filter ONLY in-stock colors for currently selected material
  const inStockColors = useMemo(() => {
    return filaments.filter(
      (f) => f.material === material && f.isAvailable && f.stockGrams > 0
    );
  }, [filaments, material]);

  // Set default color when material or filament changes
  useEffect(() => {
    if (inStockColors.length > 0) {
      if (!inStockColors.some((c) => c.color === color)) {
        setColor(inStockColors[0].color);
      }
    } else {
      setColor('');
    }
  }, [inStockColors, color]);

  // Get hex color for selected filament to paint 3D model
  const selectedFilamentHex = useMemo(() => {
    const f = inStockColors.find((c) => c.color === color);
    return f ? f.hex : '#0d9488';
  }, [inStockColors, color]);

  // Calculate current effective dimensions factoring in user scale
  const effectiveDimensions: ModelDimensions | undefined = useMemo(() => {
    if (!modelResult) return undefined;
    return {
      x: Math.round(modelResult.dimensions.x * modelScale * 10) / 10,
      y: Math.round(modelResult.dimensions.y * modelScale * 10) / 10,
      z: Math.round(modelResult.dimensions.z * modelScale * 10) / 10,
    };
  }, [modelResult, modelScale]);

  // Is current model oversized for Bambu A1 mini (180x180x180 mm)?
  const isOversized = useMemo(() => {
    if (!effectiveDimensions) return false;
    return (
      effectiveDimensions.x > BAMBU_A1_MINI_LIMITS.x ||
      effectiveDimensions.y > BAMBU_A1_MINI_LIMITS.y ||
      effectiveDimensions.z > BAMBU_A1_MINI_LIMITS.z
    );
  }, [effectiveDimensions]);

  // Dynamic estimated print time in minutes
  const dynamicEstimatedMinutes = useMemo(() => {
    if (!modelResult) return 0;
    const scaledVolume = modelResult.volumeCm3 * Math.pow(modelScale, 3);
    return estimatePrintTimeMinutes(scaledVolume, infill, quantity);
  }, [modelResult, modelScale, infill, quantity]);

  // Handle File Upload & Three.js Parsing
  const handleFileChange = async (file: File) => {
    setParseError(null);
    setSelectedFile(file);

    // 1. File Type Check
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['stl', 'obj', '3mf'].includes(ext || '')) {
      setParseError('Unsupported file type. Only .stl, .obj, and .3mf files are accepted.');
      setSelectedFile(null);
      setModelResult(null);
      return;
    }

    // 2. File Size Check (50 MB limit)
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 50) {
      setParseError(`File is too large (${sizeMB.toFixed(1)} MB). Maximum allowed file size is 50 MB.`);
      setSelectedFile(null);
      setModelResult(null);
      return;
    }

    setIsParsing(true);
    try {
      const result = await parseModelFile(file);
      setModelResult(result);
      setModelScale(1);
      setModelRotation({ x: 0, y: 0, z: 0 });

      // If initially oversized, track analytics
      if (!result.fitsA1Mini) {
        recordBlockedOversizeAttempt();
      }
    } catch (err: any) {
      console.error('Error parsing 3D model:', err);
      setParseError(err.message || 'Failed to read 3D model file. Ensure it is a valid STL or OBJ file.');
      setModelResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  // Auto Scale to Fit (Largest % that fits inside 180x180x180 mm)
  const handleScaleToFit = () => {
    if (!modelResult) return;
    const maxDim = Math.max(
      modelResult.dimensions.x,
      modelResult.dimensions.y,
      modelResult.dimensions.z
    );
    if (maxDim > 180) {
      const factor = Math.floor((176 / maxDim) * 100) / 100;
      setModelScale(factor);
    }
  };

  // Auto Rotate to Fit
  const handleAutoRotateToFit = () => {
    if (!modelResult || !modelResult.suggestedRotation) return;
    setModelRotation(modelResult.suggestedRotation);
  };

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !modelResult || !effectiveDimensions) return;

    if (isOversized) {
      alert('Cannot submit: Your 3D model exceeds the Bambu A1 mini build volume (180 × 180 × 180 mm). Please use "Scale to fit" or resize the model.');
      return;
    }

    if (!color) {
      alert('Please select an in-stock filament color for your project.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() as 'stl' | 'obj' | '3mf';
      const scaledVolume = Math.round(modelResult.volumeCm3 * Math.pow(modelScale, 3) * 10) / 10;

      const created = await createPrintRequest(
        {
          fullName: fullName.trim(),
          grade,
          section: section.trim(),
          email: email.trim().toLowerCase(),
          projectTitle: projectTitle.trim(),
          description: description.trim(),
          fileUrl: '',
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
          fileFormat: ext || 'stl',
          dimensions: effectiveDimensions,
          scale: modelScale,
          rotation: modelRotation,
          volumeCm3: scaledVolume,
          material,
          color,
          infill,
          quantity,
          preferredWindow,
          estimatedMinutes: dynamicEstimatedMinutes,
        },
        selectedFile
      );

      setSubmittedRequest(created);
    } catch (err: any) {
      console.error('Submission error:', err);
      alert('Failed to submit print request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tracking Code Lookup
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupCode.trim()) return;

    setIsLookingUp(true);
    setLookupError(null);
    setLookupResult(null);

    try {
      const found = await getRequestByTrackingCode(lookupCode.trim());
      if (!found) {
        setLookupError(`No print request found with tracking code "${lookupCode.trim().toUpperCase()}". Check your code and try again.`);
      } else {
        // If student email was also entered, verify it matches
        if (lookupEmail.trim() && found.email.toLowerCase() !== lookupEmail.trim().toLowerCase()) {
          setLookupError('Tracking code found, but the school email did not match this request.');
        } else {
          setLookupResult(found);
        }
      }
    } catch (err: any) {
      setLookupError('Could not look up request. Please check connection.');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Student Requests List (combines local saved tracking codes and lookup)
  const myRequestsList = useMemo(() => {
    return allRequests.filter((r) => savedTrackingCodes.includes(r.trackingCode));
  }, [allRequests, savedTrackingCodes]);

  // Handle Revised Model File Change
  const handleRevisedFileChange = async (file: File) => {
    setRevisedFile(file);
    try {
      const result = await parseModelFile(file);
      setRevisedModelResult(result);
    } catch (err: any) {
      alert('Invalid revised file: ' + err.message);
      setRevisedFile(null);
      setRevisedModelResult(null);
    }
  };

  // Submit revised file
  const handleConfirmResubmit = async (requestId: string) => {
    if (!revisedFile || !revisedModelResult) return;
    if (!revisedModelResult.fitsA1Mini) {
      alert('Revised model is still too big for the Bambu A1 mini (max 180 × 180 × 180 mm). Please resize it.');
      return;
    }

    setIsResubmitting(true);
    try {
      await resubmitRevisedModel(
        requestId,
        revisedFile,
        revisedModelResult.dimensions,
        revisedModelResult.volumeCm3,
        revisedModelResult.estimatedMinutes
      );
      alert('Revised 3D model successfully submitted to the lab queue!');
      setRevisingRequestId(null);
      setRevisedFile(null);
      setRevisedModelResult(null);
    } catch (err: any) {
      alert('Failed to resubmit revised model: ' + err.message);
    } finally {
      setIsResubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const getStatusStepIndex = (status: RequestStatus) => {
    switch (status) {
      case 'pending': return 1;
      case 'needs_changes': return 1;
      case 'rejected': return 1;
      case 'approved': return 2;
      case 'scheduled': return 3;
      case 'printing': return 4;
      case 'completed': return 5;
      case 'ready': return 6;
      case 'collected': return 7;
      default: return 1;
    }
  };

  const formatMinutes = (m: number) => {
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

      {/* SUBMISSION SUCCESS MODAL / CARD */}
      {submittedRequest && (
        <div className="mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-bold tracking-wide uppercase mb-3">
              <Sparkles className="w-4 h-4 text-amber-300" />
              Print Request Submitted!
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Ready for the STEAM Lab Queue
            </h2>
            <p className="mt-2 text-teal-100 text-sm sm:text-base leading-relaxed">
              Your 3D model for <span className="font-bold text-white">"{submittedRequest.projectTitle}"</span> has been securely stored.
              Keep your tracking code handy to check review updates and collection readiness.
            </p>

            {/* Tracking Code Highlight Box */}
            <div className="mt-6 p-4 rounded-2xl bg-white text-slate-900 flex flex-wrap items-center justify-between gap-4 shadow-md">
              <div>
                <p className="text-xs uppercase tracking-wider font-bold text-teal-700">Your Tracking Code</p>
                <p className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-900 tracking-wider">
                  {submittedRequest.trackingCode}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(submittedRequest.trackingCode)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSubmittedRequest(null);
                    setActiveSubTab('my-requests');
                  }}
                  className="flex items-center gap-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <span>Track Request</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-teal-100">
              <span>Saved automatically to "My Requests" on this device.</span>
              <button
                type="button"
                onClick={() => setSubmittedRequest(null)}
                className="underline hover:text-white cursor-pointer"
              >
                Submit another model
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. SUBMIT REQUEST TAB */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'submit' && (
        <div className="space-y-8">
          {/* Header Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Submit a 3D Print Request
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Upload your STL, OBJ, or 3MF model. We automatically check size dimensions against the Bambu A1 mini build envelope.
              </p>
            </div>

            {/* Printer Info Pill */}
            <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-100 border border-slate-200 text-xs text-slate-700">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <div>
                <span className="font-bold text-slate-900">Bambu Lab A1 mini:</span> 180 × 180 × 180 mm build limit
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT COLUMN: 3D Model Upload & Interactive 3D Viewer (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* File Dropzone */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <label className="block text-sm font-bold text-slate-800 mb-2">
                  1. Upload 3D File (.stl, .obj, .3mf)
                </label>

                <div className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                  selectedFile 
                    ? 'border-teal-500 bg-teal-50/30' 
                    : 'border-slate-300 hover:border-teal-400 bg-slate-50/50'
                }`}>
                  <input
                    type="file"
                    accept=".stl,.obj,.3mf"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileChange(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />

                  <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
                    <div className="w-12 h-12 rounded-2xl bg-teal-100 flex items-center justify-center text-teal-700">
                      <Upload className="w-6 h-6" />
                    </div>
                    {selectedFile ? (
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{selectedFile.name}</p>
                        <p className="text-xs text-slate-500">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Click or drag to replace
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">
                          Drag and drop your 3D model here, or <span className="text-teal-600 underline">browse</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Maximum file size 50 MB • Standard millimeter units
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {isParsing && (
                  <div className="flex items-center gap-2 mt-3 text-xs text-teal-700 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Parsing model and measuring bounding box dimensions...</span>
                  </div>
                )}

                {parseError && (
                  <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{parseError}</span>
                  </div>
                )}
              </div>

              {/* 3D Model Viewer with Bambu A1 mini Bed */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-800">
                    2. 3D Inspection & Automatic Size Check
                  </label>
                  {modelResult && (
                    <span className="text-xs font-mono text-slate-500">
                      Volume: ~{modelResult.volumeCm3} cm³
                    </span>
                  )}
                </div>

                <ModelViewer
                  geometry={modelResult ? modelResult.geometry : null}
                  dimensions={effectiveDimensions}
                  color={selectedFilamentHex}
                  scale={modelScale}
                  rotation={modelRotation}
                  onScaleChange={setModelScale}
                  onAutoRotateToFit={handleAutoRotateToFit}
                  onScaleToFit={handleScaleToFit}
                  canFitWithRotation={modelResult?.canFitWithRotation}
                  scaleToFitFactor={modelResult?.scaleToFitFactor}
                  isOversized={isOversized}
                />

                {/* Estimate Print Duration Box */}
                {modelResult && (
                  <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200/80 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Clock className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs uppercase font-bold tracking-wider text-teal-800">
                          Estimated Print Time
                        </p>
                        <p className="text-lg font-extrabold text-teal-950 font-mono">
                          ~{formatMinutes(dynamicEstimatedMinutes)}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-teal-700 bg-white/80 px-2 py-1 rounded-md border border-teal-200/50 self-center text-right font-medium">
                      Estimate — final time confirmed by the lab
                    </span>
                  </div>
                )}
              </div>

            </div>

            {/* RIGHT COLUMN: Student Details & Print Options (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  3. Student & Project Details
                </h3>

                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Student Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Maya Chen"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>

                {/* Grade & Section */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Grade Level *
                    </label>
                    <select
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    >
                      <option value="Grade 5">Grade 5</option>
                      <option value="Grade 6">Grade 6</option>
                      <option value="Grade 7">Grade 7</option>
                      <option value="Grade 8">Grade 8</option>
                      <option value="Grade 9">Grade 9</option>
                      <option value="Grade 10">Grade 10</option>
                      <option value="STEAM Club">STEAM Club</option>
                      <option value="Robotics Team">Robotics Team</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Section / Room *
                    </label>
                    <input
                      type="text"
                      required
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      placeholder="e.g. 7-A or Lab 3"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                {/* School Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    School Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@school.edu"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Used to notify you when your print is completed and ready for pickup.
                  </p>
                </div>

                {/* Project Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Project / Model Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    placeholder="e.g. Science Fair Wind Turbine Gear"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Project Description & Special Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this print for? Any supports or orientation requests?"
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>
              </div>

              {/* 4. Print Settings & Filament Material / In-Stock Color */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  4. Filament Material & In-Stock Colors
                </h3>

                {/* Material Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Filament Material *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {availableMaterials.map((mat) => (
                      <button
                        key={mat}
                        type="button"
                        onClick={() => setMaterial(mat)}
                        className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                          material === mat
                            ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {mat}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {material === 'PLA' && 'PLA: Easy, rigid, best for general science and class projects.'}
                    {material === 'PETG' && 'PETG: Tougher, heat-resistant, great for mechanical parts.'}
                    {material === 'TPU' && 'TPU: Flexible rubber-like material for dampening and grips.'}
                  </p>
                </div>

                {/* Color Selection (ONLY IN-STOCK FILAMENTS SHOWN) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Available In-Stock Colors ({material}) *
                    </label>
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Live Lab Stock
                    </span>
                  </div>

                  {inStockColors.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                      ⚠️ No colors currently in stock for {material}. Please pick another material or ask the lab manager.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {inStockColors.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setColor(item.color)}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all text-left cursor-pointer ${
                            color === item.color
                              ? 'border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-500/20'
                              : 'border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full border border-slate-300 shadow-2xs shrink-0"
                            style={{ backgroundColor: item.hex }}
                          />
                          <span className="truncate">{item.color}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Infill Percentage */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <label className="font-semibold text-slate-700">Internal Infill Density</label>
                    <span className="font-bold text-teal-700 font-mono">{infill}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="80"
                    step="5"
                    value={infill}
                    onChange={(e) => setInfill(parseInt(e.target.value))}
                    className="w-full accent-teal-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>10% (Light)</span>
                    <span className="font-bold text-slate-600">15% (Recommended)</span>
                    <span>40%+ (Strong)</span>
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantity (Max 5 per request)
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setQuantity(num)}
                        className={`w-10 h-10 rounded-xl font-bold text-sm border transition-all cursor-pointer ${
                          quantity === num
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preferred Window */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Preferred Time Window
                  </label>
                  <select
                    value={preferredWindow}
                    onChange={(e) => setPreferredWindow(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    <option value="This week (flexible)">This week (flexible)</option>
                    <option value="Before Friday">Before this Friday</option>
                    <option value="Next week">Next week</option>
                    <option value="For upcoming science fair">For upcoming STEAM showcase</option>
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!selectedFile || isOversized || isSubmitting || !color}
                className={`w-full py-4 px-6 rounded-2xl font-extrabold text-base text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  !selectedFile || isOversized || isSubmitting || !color
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-teal-600 hover:bg-teal-700 shadow-teal-600/30'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Uploading & Queuing Request...</span>
                  </>
                ) : isOversized ? (
                  <>
                    <AlertTriangle className="w-5 h-5" />
                    <span>Model Too Big for A1 mini (Scale to Fit First)</span>
                  </>
                ) : (
                  <>
                    <PackageCheck className="w-5 h-5" />
                    <span>Submit to STEAM Lab Queue</span>
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-400">
                🔒 You will receive a unique tracking code immediately after submission.
              </p>
            </div>

          </form>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. MY REQUESTS & LOOKUP TAB */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'my-requests' && (
        <div className="space-y-8">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                My Print Requests & Tracking
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Track review progress, scheduled print slots, lab feedback, and collection status.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveSubTab('submit')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-teal-700 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <span>+ New Print Request</span>
            </button>
          </div>

          {/* Quick Lookup Box (Any device) */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-teal-600" />
              <span>Look up request from any device</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Using a lab iPad or personal phone? Enter your 7-character tracking code and school email.
            </p>

            <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                required
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                placeholder="e.g. PL-4F7K2"
                className="w-full sm:w-48 px-3.5 py-2.5 text-sm font-mono font-bold uppercase rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <input
                type="email"
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
                placeholder="student@school.edu (optional)"
                className="w-full sm:w-64 px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                type="submit"
                disabled={isLookingUp}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
              >
                {isLookingUp ? 'Searching...' : 'Find Request'}
              </button>
            </form>

            {lookupError && (
              <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{lookupError}</span>
              </div>
            )}
          </div>

          {/* Lookup Result Card if active */}
          {lookupResult && (
            <div className="p-1 rounded-3xl bg-gradient-to-r from-teal-500 to-cyan-500 shadow-md">
              <div className="bg-white p-6 rounded-[22px]">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                    Lookup Result: {lookupResult.trackingCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLookupResult(null)}
                    className="text-xs text-slate-400 hover:text-slate-700"
                  >
                    Close
                  </button>
                </div>
                {renderRequestCard(lookupResult)}
              </div>
            </div>
          )}

          {/* List of Requests from this device */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-800">
              Saved Requests on this Device ({myRequestsList.length})
            </h2>

            {myRequestsList.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-3xl bg-slate-50 border border-slate-200">
                <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">No print requests yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Once you submit a 3D model, it will automatically appear here with live queue and collection status.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('submit')}
                  className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-teal-700 cursor-pointer"
                >
                  Submit Your First Print
                </button>
              </div>
            ) : (
              myRequestsList.map((req) => (
                <div key={req.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                  {renderRequestCard(req)}
                </div>
              ))
            )}
          </div>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. PUBLIC LAB SCHEDULE TAB */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'schedule' && (
        <div className="space-y-8">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Bambu Lab A1 mini Schedule
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Real-time booking timeline. The STEAM Lab operates a single Bambu Lab A1 mini 3D printer.
              </p>
            </div>

            {/* Printer Status Badge */}
            <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs font-medium text-slate-700">
              <span className={`w-2.5 h-2.5 rounded-full ${
                printerStatus?.status === 'available' ? 'bg-emerald-500' :
                printerStatus?.status === 'printing' ? 'bg-teal-500' :
                printerStatus?.status === 'maintenance' ? 'bg-amber-500' : 'bg-rose-500'
              }`} />
              <span>Current Status: <strong className="capitalize">{printerStatus?.status || 'Available'}</strong></span>
            </div>
          </div>

          {/* Maintenance Mode Warning Notice if active */}
          {(printerStatus?.status === 'maintenance' || printerStatus?.status === 'offline') && (
            <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Printer is currently under {printerStatus.status}</h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  {printerStatus.maintenanceReason || 'Routine nozzle cleaning and bed calibration.'}
                </p>
                {printerStatus.expectedReturnDate && (
                  <p className="text-xs font-semibold text-amber-900 mt-1">
                    Expected return: {new Date(printerStatus.expectedReturnDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Bookings Timeline Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-600" />
                <span>Upcoming Scheduled Print Jobs ({bookings.filter(b => b.status === 'scheduled' || b.status === 'printing').length})</span>
              </h3>
              <span className="text-xs text-slate-500">
                15 min buffer between prints for bed cooling
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {bookings.filter(b => b.status === 'scheduled' || b.status === 'printing').length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No upcoming bookings currently scheduled on the Bambu A1 mini timeline.
                </div>
              ) : (
                bookings
                  .filter(b => b.status === 'scheduled' || b.status === 'printing')
                  .map((b) => (
                    <div key={b.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={`w-3 h-12 rounded-full shrink-0 ${
                          b.status === 'printing' ? 'bg-teal-500' : 'bg-slate-300'
                        }`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{b.projectTitle}</span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                              {b.trackingCode}
                            </span>
                            {b.status === 'printing' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800">
                                Printing Now
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Student: {b.studentName} • Material: {b.material} ({b.color})
                          </p>
                        </div>
                      </div>

                      <div className="text-right sm:self-center">
                        <div className="text-xs font-semibold text-slate-800 font-mono">
                          {new Date(b.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {' - '}
                          {new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {' '}({b.durationMinutes}m)
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );

  // Helper renderer for individual request cards
  function renderRequestCard(req: PrintRequest) {
    const isNeedsChanges = req.status === 'needs_changes';
    const isCurrentlyRevising = revisingRequestId === req.id;

    // Calculate queue position if pending or scheduled
    const pendingList = allRequests.filter(r => r.status === 'pending');
    const queuePos = pendingList.findIndex(r => r.id === req.id) + 1;

    return (
      <div className="space-y-4">
        {/* Top Details & Status Pill */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-slate-900 text-lg">{req.projectTitle}</h3>
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 text-xs font-mono font-bold">
                {req.trackingCode}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Submitted on {new Date(req.createdAt).toLocaleDateString()} by {req.fullName} ({req.grade}, {req.section})
            </p>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
              req.status === 'pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
              req.status === 'approved' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
              req.status === 'scheduled' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
              req.status === 'printing' ? 'bg-teal-100 text-teal-800 border border-teal-200' :
              req.status === 'completed' || req.status === 'ready' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
              req.status === 'collected' ? 'bg-slate-200 text-slate-700' :
              req.status === 'needs_changes' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
              'bg-rose-100 text-rose-800 border border-rose-200'
            }`}>
              {req.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Live Stepper */}
        <div className="py-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1.5 overflow-x-auto">
            <span className={getStatusStepIndex(req.status) >= 1 ? 'text-teal-700' : ''}>1. Submitted</span>
            <span className={getStatusStepIndex(req.status) >= 2 ? 'text-teal-700' : ''}>2. Approved</span>
            <span className={getStatusStepIndex(req.status) >= 3 ? 'text-teal-700' : ''}>3. Scheduled</span>
            <span className={getStatusStepIndex(req.status) >= 4 ? 'text-teal-700' : ''}>4. Printing</span>
            <span className={getStatusStepIndex(req.status) >= 6 ? 'text-emerald-700 font-extrabold' : ''}>5. Ready for Collection</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-teal-600 h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (getStatusStepIndex(req.status) / 6) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Queue Position or Scheduled Slot */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
          <div>
            <span className="text-slate-400 block">Filament:</span>
            <span className="font-semibold text-slate-800">{req.material} • {req.color}</span>
          </div>

          <div>
            <span className="text-slate-400 block">Dimensions:</span>
            <span className="font-semibold text-slate-800 font-mono">
              {req.dimensions.x} × {req.dimensions.y} × {req.dimensions.z} mm
            </span>
          </div>

          <div>
            <span className="text-slate-400 block">Queue / Slot:</span>
            {req.scheduledSlot ? (
              <span className="font-bold text-purple-700 font-mono">
                {new Date(req.scheduledSlot.start).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                {new Date(req.scheduledSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : req.status === 'pending' && queuePos > 0 ? (
              <span className="font-semibold text-slate-700">Queue position #{queuePos}</span>
            ) : (
              <span className="text-slate-500 capitalize">{req.status}</span>
            )}
          </div>
        </div>

        {/* Lab Feedback & Instructions */}
        {(req.adminComment || req.changeRequestReason || req.rejectionReason) && (
          <div className={`p-4 rounded-2xl text-xs ${
            isNeedsChanges ? 'bg-amber-50 border border-amber-200 text-amber-900' :
            req.status === 'rejected' ? 'bg-rose-50 border border-rose-200 text-rose-900' :
            'bg-blue-50 border border-blue-200 text-blue-900'
          }`}>
            <span className="font-bold block uppercase tracking-wider mb-0.5">
              STEAM Lab Feedback:
            </span>
            <p>{req.changeRequestReason || req.rejectionReason || req.adminComment}</p>
          </div>
        )}

        {/* Needs Changes: Upload Revised File Dropzone */}
        {isNeedsChanges && (
          <div className="p-4 rounded-2xl bg-orange-50/70 border border-orange-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-orange-900">
                Action Required: Upload Revised 3D Model
              </span>
              <button
                type="button"
                onClick={() => setRevisingRequestId(isCurrentlyRevising ? null : req.id)}
                className="text-xs text-orange-800 underline font-semibold cursor-pointer"
              >
                {isCurrentlyRevising ? 'Cancel' : 'Upload Revised File'}
              </button>
            </div>

            {isCurrentlyRevising && (
              <div className="space-y-3 pt-2">
                <input
                  type="file"
                  accept=".stl,.obj,.3mf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleRevisedFileChange(e.target.files[0]);
                    }
                  }}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-orange-600 file:text-white hover:file:bg-orange-700 cursor-pointer"
                />

                {revisedModelResult && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-orange-200 text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{revisedFile?.name}</p>
                      <p className="font-mono text-slate-500">
                        {revisedModelResult.dimensions.x} × {revisedModelResult.dimensions.y} × {revisedModelResult.dimensions.z} mm
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isResubmitting || !revisedModelResult.fitsA1Mini}
                      onClick={() => handleConfirmResubmit(req.id)}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold cursor-pointer transition-colors"
                    >
                      {isResubmitting ? 'Submitting...' : 'Confirm Resubmission'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Ready for Collection Notice */}
        {(req.status === 'ready' || req.status === 'completed') && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-xs">Ready for pickup at the STEAM Lab!</p>
              <p className="text-[11px] text-emerald-700">
                Please visit Room 204 during lab hours (08:30 – 16:30) and show tracking code <strong>{req.trackingCode}</strong>.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
};
