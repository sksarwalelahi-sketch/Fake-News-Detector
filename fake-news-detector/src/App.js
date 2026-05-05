import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:5000';
const RECENCY_MODE_OPTIONS = [
  { value: 'all-time', label: 'All Time Evidence', hint: 'Use all available evidence.' },
  { value: 'one-week', label: 'Last 7 Days Only', hint: 'Only current-week evidence is considered.' },
];
const DEMO_PRESETS = [
  {
    id: 'en-health-rumor-suspicious',
    label: 'EN Health Rumor',
    language: 'English',
    text: 'Breaking: Drinking hot salt water every hour completely cures viral fever in one day, according to doctors.',
    expected: 'Real',
  },
  {
    id: 'en-mainstream-real',
    label: 'EN Mainstream News',
    language: 'English',
    text: 'The city administration announced expanded metro services and published the updated schedule on its official transport portal.',
    expected: 'Real',
  },
  {
    id: 'hi-claim-unverified',
    label: 'HI Claim',
    language: 'Hindi',
    text: 'सरकार ने घोषणा की है कि अगले महीने से हर नागरिक के बैंक खाते में बिना शर्त 5000 रुपये जमा किए जाएंगे।',
    expected: 'Unverified',
  },
  {
    id: 'bn-election-rumor-suspicious',
    label: 'BN Election Rumor',
    language: 'Bengali',
    text: 'ভোটের আগে গোপনে নতুন নিয়ম হয়েছে, ২০২৬ থেকে শুধু নির্দিষ্ট দলের ভোটই গণনা করা হবে।',
    expected: 'Fake',
  },
  {
    id: 'ta-disaster-rumor-suspicious',
    label: 'TA Disaster Rumor',
    language: 'Tamil',
    text: 'அடுத்த 24 மணிநேரத்தில் முழு மாநிலத்தையும் மிகப்பெரிய நிலநடுக்கம் தாக்கும் என்று அதிகாரப்பூர்வமாக அறிவிக்கப்பட்டதாக செய்திகள் கூறுகின்றன।',
    expected: 'Suspicious',
  },
  {
    id: 'or-public-service-real',
    label: 'OR Public Service',
    language: 'Odia',
    text: 'ଆସନ୍ତା ସପ୍ତାହରୁ ସହରର ସମସ୍ତ ସରକାରୀ ବସ ସେବା ପାଇଁ ନୂଆ ସମୟସୂଚୀ ଜାରି ହେବ ବୋଲି ପରିବହନ ବିଭାଗ ସୂଚନା ଦେଇଛି।',
    expected: 'Real',
  },
];

const badgeClassByLabel = (label = '') => {
  const normalized = String(label).toLowerCase();
  if (normalized === 'fake') return 'badge badge-fake';
  if (normalized === 'real') return 'badge badge-real';
  if (normalized === 'likely real') return 'badge badge-likely-real';
  if (normalized === 'suspicious') return 'badge badge-suspicious';
  if (normalized === 'unverified') return 'badge badge-unverified';
  return 'badge badge-error';
};

const credibilityClassByTier = (tier = '') => {
  const normalized = String(tier).toLowerCase();
  if (normalized === 'high') return 'credibility-badge credibility-high';
  if (normalized === 'medium') return 'credibility-badge credibility-medium';
  return 'credibility-badge credibility-unknown';
};

const freshnessClassByBucket = (bucket = '') => {
  const normalized = String(bucket).toLowerCase();
  if (normalized === 'breaking') return 'freshness-badge freshness-breaking';
  if (normalized === 'today') return 'freshness-badge freshness-today';
  if (normalized === 'recent' || normalized === 'this week') return 'freshness-badge freshness-recent';
  return 'freshness-badge freshness-older';
};

const consensusClassByStatus = (status = '') => {
  const normalized = String(status).toLowerCase();
  if (normalized === 'agreement') return 'consensus-badge consensus-agreement';
  if (normalized === 'mixed') return 'consensus-badge consensus-mixed';
  if (normalized === 'conflict') return 'consensus-badge consensus-conflict';
  return 'consensus-badge consensus-limited';
};

const clampPercent = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value * 100));
};

const formatLabel = (value = '') => {
  if (!value) return 'Unknown';
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
};

const confidenceBand = (score) => {
  if (score >= 0.8) return { label: 'High', className: 'confidence-pill confidence-high' };
  if (score >= 0.6) return { label: 'Medium', className: 'confidence-pill confidence-medium' };
  return { label: 'Low', className: 'confidence-pill confidence-low' };
};

const resolveDecisionSignals = (result) => {
  const fromEvidence = result?.evidence?.decisionSignals || {};
  const decisionSimilarity =
    typeof fromEvidence?.decisionSimilarity === 'number'
      ? fromEvidence.decisionSimilarity
      : typeof result?.similarity === 'number'
        ? result.similarity
        : 0;
  const factCheckSimilarity =
    typeof fromEvidence?.factCheckSimilarity === 'number'
      ? fromEvidence.factCheckSimilarity
      : typeof result?.factCheckSimilarity === 'number'
        ? result.factCheckSimilarity
        : 0;
  const liveNewsSimilarity =
    typeof fromEvidence?.liveNewsSimilarity === 'number'
      ? fromEvidence.liveNewsSimilarity
      : typeof result?.liveNewsSimilarity === 'number'
        ? result.liveNewsSimilarity
        : 0;
  const officialContextSimilarity =
    typeof fromEvidence?.officialContextSimilarity === 'number'
      ? fromEvidence.officialContextSimilarity
      : typeof result?.officialContextSimilarity === 'number'
        ? result.officialContextSimilarity
        : 0;
  const officialContextRelevance =
    typeof fromEvidence?.officialContextRelevance === 'number'
      ? fromEvidence.officialContextRelevance
      : typeof result?.officialContextRelevance === 'number'
        ? result.officialContextRelevance
        : 0;
  const socialContextSimilarity =
    typeof fromEvidence?.socialContextSimilarity === 'number'
      ? fromEvidence.socialContextSimilarity
      : typeof result?.socialContextSimilarity === 'number'
        ? result.socialContextSimilarity
        : 0;
  const officialMode =
    typeof fromEvidence?.officialMode === 'boolean'
      ? fromEvidence.officialMode
      : Boolean(result?.officialMode);

  return {
    decisionSimilarity,
    factCheckSimilarity,
    liveNewsSimilarity,
    officialContextSimilarity,
    officialContextRelevance,
    socialContextSimilarity,
    officialMode,
  };
};

const resultFromHistory = (entry) => ({
  label: entry?.result || 'Unverified',
  reason: entry?.reason || '',
  similarity: typeof entry?.similarity === 'number' ? entry.similarity : 0,
  factCheckSimilarity: typeof entry?.factCheckSimilarity === 'number' ? entry.factCheckSimilarity : 0,
  liveNewsSimilarity: typeof entry?.liveNewsSimilarity === 'number' ? entry.liveNewsSimilarity : 0,
  officialContextSimilarity: typeof entry?.officialContextSimilarity === 'number' ? entry.officialContextSimilarity : 0,
  officialContextRelevance: typeof entry?.officialContextRelevance === 'number' ? entry.officialContextRelevance : 0,
  socialContextSimilarity: typeof entry?.socialContextSimilarity === 'number' ? entry.socialContextSimilarity : 0,
  source: entry?.source || '',
  language: entry?.language || 'unknown',
  translationApplied: Boolean(entry?.translationApplied),
  translatedText: entry?.translatedText || entry?.text || '',
  recencyMode: entry?.recencyMode || 'all-time',
  evidence: entry?.evidence || {
    factCheck: null,
    liveNews: [],
    officialContext: [],
    officialTargets: [],
    socialContext: [],
    liveNewsConsensus: { status: 'Limited', score: 0, summary: 'No saved consensus.' },
    liveNewsError: null,
    officialContextError: null,
    socialContextError: null,
    factCheckError: null,
    decisionSignals: null,
  },
  imageVerification: entry?.imageVerification || null,
  duplicateImage: entry?.duplicateImage || null,
});

function App() {
  const resultRef = useRef(null);
  const [newsText, setNewsText] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [result, setResult] = useState(null);
  const [recencyMode, setRecencyMode] = useState('one-week');
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState('checking');
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    mode: null,
    itemId: null,
    textPreview: '',
  });

  const stats = useMemo(() => {
    const total = history.length;
    const fakeCount = history.filter((item) => String(item.result).toLowerCase() === 'fake').length;
    const realCount = history.filter((item) => {
      const value = String(item.result).toLowerCase();
      return value === 'real' || value === 'likely real';
    }).length;
    return { total, fakeCount, realCount };
  }, [history]);

  const analytics = useMemo(() => {
    const safeHistory = Array.isArray(history) ? history : [];
    const labelCounts = safeHistory.reduce((acc, item) => {
      const key = String(item.result || 'unknown').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const languageCounts = safeHistory.reduce((acc, item) => {
      const key = String(item.language || 'unknown').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const translatedCount = safeHistory.filter((item) => item.translationApplied).length;
    const evidenceBackedCount = safeHistory.filter(
      (item) => item.evidence && Object.keys(item.evidence).length
    ).length;

    const labelDistribution = Object.entries(labelCounts)
      .map(([label, count]) => ({
        label,
        count,
        percent: safeHistory.length ? (count / safeHistory.length) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const languageDistribution = Object.entries(languageCounts)
      .map(([language, count]) => ({
        language,
        count,
        percent: safeHistory.length ? (count / safeHistory.length) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const recentActivity = safeHistory
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        label: String(item.result || 'unknown'),
        createdAt: item.createdAt,
        text: item.text,
      }));

    return {
      translatedCount,
      evidenceBackedCount,
      labelDistribution,
      languageDistribution,
      recentActivity,
    };
  }, [history]);

  const signals = useMemo(() => resolveDecisionSignals(result), [result]);
  const confidence = useMemo(
    () => confidenceBand(typeof signals?.decisionSimilarity === 'number' ? signals.decisionSimilarity : 0),
    [signals]
  );

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/history?limit=50`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load history.');
      }
      setHistory(Array.isArray(data.items) ? data.items : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const checkHealth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSystemStatus('error');
        return;
      }
      setSystemStatus(data.firebase_ready ? 'ready' : 'degraded');
    } catch {
      setSystemStatus('error');
    }
  };

  useEffect(() => {
    loadHistory();
    checkHealth();
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const formatTime = (isoTime) =>
    new Date(isoTime).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  const handleAnalyze = async () => {
    if (!newsText.trim()) {
      setResult({ label: 'Input Required', reason: 'Please enter some news text first.' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      const response = await fetch(`${API_BASE_URL}/check-news`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          text: newsText.trim(),
          recencyMode,
          demoPresetId:
            selectedPresetId && DEMO_PRESETS.some((item) => item.id === selectedPresetId && item.text === newsText)
              ? selectedPresetId
              : '',
        }),
      });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze text.');
      }

      setResult(data);
      if (data.historyItem) {
        const item = {
          ...data.historyItem,
          id: data.historyItem.id || `local-${Date.now()}`,
        };
        setHistory((prev) => [item, ...prev]);
      }
    } catch (error) {
      const message = String(error?.message || '');
      const isNetworkError =
        error instanceof TypeError || /failed to fetch|networkerror/i.test(message);
      const isTimeout = error?.name === 'AbortError';

      setResult({
        label: 'Error',
        reason: isTimeout
          ? 'Request timed out after 45 seconds. Backend is taking too long; check backend logs and internet connectivity.'
          : isNetworkError
          ? `Cannot connect to backend at ${API_BASE_URL}. Start Flask API first (python app.py in Backend folder).`
          : message || 'Could not connect to backend API.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (event) => {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    if (!file) {
      setImageFile(null);
      setImagePreviewUrl('');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setResult({
        label: 'Input Required',
        reason: 'Unsupported image type. Please use JPG, PNG, or WEBP.',
      });
      setImageFile(null);
      setImagePreviewUrl('');
      return;
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setResult(null);
  };

  const handleVerifyImage = async () => {
    if (!imageFile) {
      setResult({ label: 'Input Required', reason: 'Please upload an image first.' });
      return;
    }

    setImageLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('recencyMode', recencyMode);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(`${API_BASE_URL}/verify-image`, {
        method: 'POST',
        signal: controller.signal,
        body: formData,
      });
      clearTimeout(timeoutId);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify image.');
      }

      setResult(data);
      if (data.historyItem) {
        const item = {
          ...data.historyItem,
          id: data.historyItem.id || `local-${Date.now()}`,
        };
        setHistory((prev) => [item, ...prev]);
      }
    } catch (error) {
      setResult({
        label: 'Error',
        reason:
          error?.name === 'AbortError'
            ? 'Image verification timed out after 45 seconds. Please retry after backend is ready.'
            : String(error?.message || 'Could not verify image.'),
      });
    } finally {
      setImageLoading(false);
    }
  };

  const loadPreset = (preset) => {
    setNewsText(preset.text);
    setSelectedPresetId(preset.id);
    setResult(null);
  };

  const requestDeleteItem = (item) => {
    setConfirmDialog({
      open: true,
      mode: 'single',
      itemId: item.id,
      textPreview: item.text,
    });
  };

  const requestClearAll = () => {
    setConfirmDialog({
      open: true,
      mode: 'all',
      itemId: null,
      textPreview: '',
    });
  };

  const closeConfirm = () => {
    setConfirmDialog({
      open: false,
      mode: null,
      itemId: null,
      textPreview: '',
    });
  };

  const runConfirmedAction = async () => {
    const { mode, itemId } = confirmDialog;
    closeConfirm();

    try {
      if (mode === 'all') {
        const response = await fetch(`${API_BASE_URL}/history`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Failed to clear history.');
        }
        setHistory([]);
        return;
      }

      if (mode === 'single' && itemId) {
        const response = await fetch(`${API_BASE_URL}/history/${itemId}`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || data.details || 'Failed to delete history item.');
        }
        setHistory((prev) => prev.filter((item) => item.id !== itemId));
      }
    } catch (error) {
      setResult({
        label: 'Error',
        reason: String(error?.message || 'Unable to complete delete action.'),
      });
    }
  };

  const showHistoryDetails = (entry) => {
    setNewsText(entry?.text || '');
    setRecencyMode(entry?.recencyMode === 'one-week' ? 'one-week' : 'all-time');
    setResult(resultFromHistory(entry));
    // Ensure the user lands on the result/explainability panel when opening old records.
    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="app-shell">
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />

      <main className="main-card">
        <header className="header">
          <div className="title-row">
            <h1>Fake News Detector</h1>
            <span className={`health-pill health-${systemStatus}`}>
              {systemStatus === 'ready' && 'System Ready'}
              {systemStatus === 'degraded' && 'Partial Service'}
              {systemStatus === 'error' && 'Backend Offline'}
              {systemStatus === 'checking' && 'Checking...'}
            </span>
          </div>
          <p>Paste a headline or article snippet and detect credibility with AI, verified fact-check sources, and live news evidence.</p>

          <div className="stats-strip">
            <div className="stat-card">
              <span>Total Checks</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="stat-card">
              <span>Fake Flagged</span>
              <strong>{stats.fakeCount}</strong>
            </div>
            <div className="stat-card">
              <span>Real Confirmed</span>
              <strong>{stats.realCount}</strong>
            </div>
          </div>
        </header>

        <section className="input-area">
          <div className="preset-head">
            <label>Demo Presets</label>
            <span>One-click multilingual demo inputs</span>
          </div>
          <div className="preset-grid">
            {DEMO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`preset-btn ${selectedPresetId === preset.id ? 'preset-btn-active' : ''}`}
                onClick={() => loadPreset(preset)}
              >
                <strong>{preset.label}</strong>
                <span>{preset.language} | Demo target: {preset.expected}</span>
              </button>
            ))}
          </div>

          <label htmlFor="news-input">News Text</label>
          <div className="recency-toggle-wrap">
            <div className="recency-toggle-head">
              <strong>Verification Window</strong>
              <span>{recencyMode === 'one-week' ? 'Current-mode enabled' : 'Standard mode'}</span>
            </div>
            <div className="recency-toggle-row">
              {RECENCY_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`recency-btn ${recencyMode === option.value ? 'recency-btn-active' : ''}`}
                  onClick={() => setRecencyMode(option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <textarea
            id="news-input"
            placeholder="Type or paste news content here..."
            value={newsText}
            onChange={(e) => setNewsText(e.target.value)}
            rows={7}
          />

          <button className="analyze-btn" onClick={handleAnalyze} disabled={loading || imageLoading} type="button">
            {loading ? 'Analyzing...' : 'Analyze News'}
          </button>

          <div className="image-verify-box">
            <div className="image-verify-head">
              <label htmlFor="image-input">Image Verification (OCR + Fact Check)</label>
              <span>Upload a news image to extract claim text and verify it</span>
            </div>
            <input
              id="image-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageChange}
            />
            {imagePreviewUrl ? (
              <div className="image-preview-card">
                <img src={imagePreviewUrl} alt="Preview for verification" className="image-preview" />
                <p>{imageFile?.name || 'Selected image'}</p>
              </div>
            ) : null}
            <button
              className="secondary-btn"
              onClick={handleVerifyImage}
              disabled={imageLoading}
              type="button"
            >
              {imageLoading ? 'Verifying Image...' : 'Verify Image'}
            </button>
          </div>
        </section>

        <section ref={resultRef} className="result-box" aria-live="polite">
          {loading ? (
            <div className="loading-wrap">
              <span className="spinner" />
              <span>Checking trusted fact-check sources...</span>
            </div>
          ) : (
            <div>
              {result?.label ? (
                <span className={badgeClassByLabel(result.label)}>{result.label}</span>
              ) : (
                <p>Result will appear here.</p>
              )}
              {result?.reason ? <p>{result.reason}</p> : null}
              {typeof result?.similarity === 'number' ? (
                <p>Decision similarity: {result.similarity.toFixed(3)}</p>
              ) : null}
              {typeof result?.factCheckSimilarity === 'number' ? (
                <p>Fact-check similarity: {result.factCheckSimilarity.toFixed(3)}</p>
              ) : null}
              {typeof result?.liveNewsSimilarity === 'number' ? (
                <p>Live news relevance: {result.liveNewsSimilarity.toFixed(3)}</p>
              ) : null}
              {typeof result?.officialContextSimilarity === 'number' ? (
                <p>Official site relevance: {result.officialContextSimilarity.toFixed(3)}</p>
              ) : null}
              {typeof result?.officialContextRelevance === 'number' ? (
                <p>Official priority score: {result.officialContextRelevance.toFixed(3)}</p>
              ) : null}
              {typeof result?.socialContextSimilarity === 'number' ? (
                <p>Social corroboration relevance: {result.socialContextSimilarity.toFixed(3)}</p>
              ) : null}
              {result?.translationApplied && result?.translatedText ? (
                <p>Translated for analysis: {result.translatedText}</p>
              ) : null}
              {result?.recencyMode ? (
                <p>
                  Evidence window:{' '}
                  {String(result.recencyMode).toLowerCase() === 'one-week'
                    ? 'Last 7 days only'
                    : 'All time'}
                </p>
              ) : null}
              {result?.source ? (
                <p>
                  Source:{' '}
                  <a href={result.source} target="_blank" rel="noreferrer">
                    {result.source}
                  </a>
                </p>
              ) : null}
              {result?.demoOverride ? <p>Demo scenario mode: preset outcome applied for presentation.</p> : null}
              {result?.imageVerification?.mode ? (
                <p>Image mode: {result.imageVerification.mode}</p>
              ) : null}
              {result?.imageVerification?.fileName ? (
                <p>Image file: {result.imageVerification.fileName}</p>
              ) : null}
              {result?.imageVerification?.ocrText ? (
                <p>Extracted text: {result.imageVerification.ocrText}</p>
              ) : null}
              {result?.imageVerification?.reverseLookup?.searchUrl ? (
                <p>
                  Reverse lookup:{' '}
                  <a href={result.imageVerification.reverseLookup.searchUrl} target="_blank" rel="noreferrer">
                    Open Google reverse-image results
                  </a>
                </p>
              ) : null}
              {result?.imageVerification?.reverseLookup?.lookupError ? (
                <p>Reverse lookup note: {result.imageVerification.reverseLookup.lookupError}</p>
              ) : null}
              {result?.duplicateImage?.isDuplicate ? (
                <p>
                  Duplicate alert: This image fingerprint already appears in {result.duplicateImage.count} previous
                  history item(s).
                </p>
              ) : null}
            </div>
          )}
        </section>

        {result?.evidence ? (
          <section className="evidence-box">
            <div className="evidence-head">
              <h2>Why This Result</h2>
              <span>Explainable AI layer</span>
            </div>

            <div className="comparison-grid">
              <div className="comparison-card">
                <h3>User Claim</h3>
                <p>{newsText.trim() || 'No input provided.'}</p>
              </div>

              <div className="comparison-card">
                <h3>Matched Verified Claim</h3>
                <p>{result.evidence.factCheck?.claim || 'No direct verified claim match found.'}</p>
              </div>
            </div>

            <div className="evidence-card confidence-card">
              <div className="consensus-head">
                <h3>Evidence Confidence Meter</h3>
                <span className={confidence.className}>{confidence.label} confidence</span>
              </div>
              <p>
                Decision confidence is based on the combined verification signal currently at{' '}
                <strong>{clampPercent(signals?.decisionSimilarity).toFixed(0)}%</strong>.
              </p>
              <div className="confidence-grid">
                <div className="confidence-row">
                  <span>Decision Signal</span>
                  <strong>{clampPercent(signals?.decisionSimilarity).toFixed(0)}%</strong>
                </div>
                <div className="score-track">
                  <div className="score-fill score-fill-primary" style={{ width: `${clampPercent(signals?.decisionSimilarity)}%` }} />
                </div>

                <div className="confidence-row">
                  <span>Fact-check Signal</span>
                  <strong>{clampPercent(signals?.factCheckSimilarity).toFixed(0)}%</strong>
                </div>
                <div className="score-track">
                  <div className="score-fill score-fill-secondary" style={{ width: `${clampPercent(signals?.factCheckSimilarity)}%` }} />
                </div>

                <div className="confidence-row">
                  <span>Live Coverage Signal</span>
                  <strong>{clampPercent(signals?.liveNewsSimilarity).toFixed(0)}%</strong>
                </div>
                <div className="score-track">
                  <div className="score-fill score-fill-tertiary" style={{ width: `${clampPercent(signals?.liveNewsSimilarity)}%` }} />
                </div>

                <div className="confidence-row">
                  <span>Official Website Signal</span>
                  <strong>{clampPercent(signals?.officialContextSimilarity).toFixed(0)}%</strong>
                </div>
                <div className="score-track">
                  <div className="score-fill score-fill-quaternary" style={{ width: `${clampPercent(signals?.officialContextSimilarity)}%` }} />
                </div>

                <div className="confidence-row">
                  <span>Official Priority Signal</span>
                  <strong>{clampPercent(signals?.officialContextRelevance).toFixed(0)}%</strong>
                </div>
                <div className="score-track">
                  <div className="score-fill score-fill-secondary" style={{ width: `${clampPercent(signals?.officialContextRelevance)}%` }} />
                </div>

                <div className="confidence-row">
                  <span>Social Corroboration Signal</span>
                  <strong>{clampPercent(signals?.socialContextSimilarity).toFixed(0)}%</strong>
                </div>
                <div className="score-track">
                  <div className="score-fill score-fill-consensus" style={{ width: `${clampPercent(signals?.socialContextSimilarity)}%` }} />
                </div>
              </div>
              <p>{signals?.officialMode ? 'Official-mode decision path was active.' : 'Corroboration/fallback decision path was active.'}</p>
            </div>

            <div className="scoreboard">
              <div className="score-card">
                <div className="score-row">
                  <span>Decision similarity</span>
                  <strong>{clampPercent(result?.similarity).toFixed(0)}%</strong>
                </div>
                <div className="score-track">
                  <div className="score-fill score-fill-primary" style={{ width: `${clampPercent(result?.similarity)}%` }} />
                </div>
              </div>

              <div className="score-card">
                <div className="score-row">
                  <span>Fact-check match</span>
                  <strong>{clampPercent(result?.factCheckSimilarity).toFixed(0)}%</strong>
                </div>
                <div className="score-track">
                  <div
                    className="score-fill score-fill-secondary"
                    style={{ width: `${clampPercent(result?.factCheckSimilarity)}%` }}
                  />
                </div>
              </div>

              <div className="score-card">
                <div className="score-row">
                  <span>Live news relevance</span>
                  <strong>{clampPercent(result?.liveNewsSimilarity).toFixed(0)}%</strong>
                </div>
                <div className="score-track">
                  <div
                    className="score-fill score-fill-tertiary"
                    style={{ width: `${clampPercent(result?.liveNewsSimilarity)}%` }}
                  />
                </div>
              </div>

              <div className="score-card">
                <div className="score-row">
                  <span>Official site relevance</span>
                  <strong>
                    {clampPercent(result?.officialContextSimilarity).toFixed(0)}%
                  </strong>
                </div>
                <div className="score-track">
                  <div
                    className="score-fill score-fill-quaternary"
                    style={{ width: `${clampPercent(result?.officialContextSimilarity)}%` }}
                  />
                </div>
              </div>

              <div className="score-card">
                <div className="score-row">
                  <span>Top source credibility</span>
                  <strong>
                    {clampPercent(result?.evidence?.liveNews?.[0]?.credibilityScore).toFixed(0)}%
                  </strong>
                </div>
                <div className="score-track">
                  <div
                    className="score-fill score-fill-tertiary"
                    style={{ width: `${clampPercent(result?.evidence?.liveNews?.[0]?.credibilityScore)}%` }}
                  />
                </div>
              </div>

              <div className="score-card">
                <div className="score-row">
                  <span>Social corroboration</span>
                  <strong>
                    {clampPercent(result?.socialContextSimilarity).toFixed(0)}%
                  </strong>
                </div>
                <div className="score-track">
                  <div
                    className="score-fill score-fill-consensus"
                    style={{ width: `${clampPercent(result?.socialContextSimilarity)}%` }}
                  />
                </div>
              </div>

              <div className="score-card">
                <div className="score-row">
                  <span>Top evidence freshness</span>
                  <strong>
                    {clampPercent(result?.evidence?.liveNews?.[0]?.freshnessScore).toFixed(0)}%
                  </strong>
                </div>
                <div className="score-track">
                  <div
                    className="score-fill score-fill-quaternary"
                    style={{ width: `${clampPercent(result?.evidence?.liveNews?.[0]?.freshnessScore)}%` }}
                  />
                </div>
              </div>

              <div className="score-card">
                <div className="score-row">
                  <span>Source consensus</span>
                  <strong>
                    {clampPercent(result?.evidence?.liveNewsConsensus?.score).toFixed(0)}%
                  </strong>
                </div>
                <div className="score-track">
                  <div
                    className="score-fill score-fill-consensus"
                    style={{ width: `${clampPercent(result?.evidence?.liveNewsConsensus?.score)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="evidence-card">
              <div className="consensus-head">
                <h3>Live Source Consensus</h3>
                <span className={consensusClassByStatus(result.evidence.liveNewsConsensus?.status)}>
                  {result.evidence.liveNewsConsensus?.status || 'Limited'}
                </span>
              </div>
              <p>{result.evidence.liveNewsConsensus?.summary || 'Consensus analysis unavailable.'}</p>
            </div>

            {result.evidence.factCheck ? (
              <div className="evidence-card">
                <h3>Matched Fact-Check</h3>
                <p>{result.evidence.factCheck.claim || 'Claim text unavailable.'}</p>
                {result.evidence.factCheck.rating ? <p>Rating: {result.evidence.factCheck.rating}</p> : null}
                {result.evidence.factCheck.source ? (
                  <p>
                    Evidence Source:{' '}
                    <a href={result.evidence.factCheck.source} target="_blank" rel="noreferrer">
                      {result.evidence.factCheck.source}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="evidence-card">
                <h3>Matched Fact-Check</h3>
                <p>No direct verified fact-check match was returned for this claim.</p>
              </div>
            )}

            <div className="evidence-card">
              <h3>Recent Live News Coverage</h3>
              {result.evidence.liveNewsError ? <p>{result.evidence.liveNewsError}</p> : null}
              {Array.isArray(result.evidence.liveNews) && result.evidence.liveNews.length ? (
                <ul className="evidence-list">
                  {result.evidence.liveNews.map((article, index) => (
                    <li key={`${article.link}-${index}`} className="evidence-item">
                      <div className="evidence-item-top">
                        <a href={article.link} target="_blank" rel="noreferrer">
                          {article.title}
                        </a>
                        <div className="evidence-pill-row">
                          <span className={credibilityClassByTier(article.credibilityTier)}>
                            {article.credibilityTier || 'Unknown'} credibility
                          </span>
                          <span className={freshnessClassByBucket(article.freshnessBucket)}>
                            {article.freshnessBucket || 'Unknown'} freshness
                          </span>
                        </div>
                      </div>
                      <span>
                        {article.source || 'Source unavailable'}
                        {article.publishedAt ? ` | ${article.publishedAt}` : ''}
                        {typeof article.relevance === 'number' ? ` | final ${article.relevance.toFixed(3)}` : ''}
                        {typeof article.semanticRelevance === 'number' ? ` | semantic ${article.semanticRelevance.toFixed(3)}` : ''}
                        {typeof article.credibilityScore === 'number' ? ` | source ${article.credibilityScore.toFixed(2)}` : ''}
                        {typeof article.freshnessScore === 'number' ? ` | fresh ${article.freshnessScore.toFixed(2)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No live news articles were matched for this query.</p>
              )}
            </div>

            <div className="evidence-card">
              <h3>Official Website Context (Proof Links)</h3>
              {Array.isArray(result.evidence.officialTargets) && result.evidence.officialTargets.length ? (
                <p>
                  Targeted official sources:{' '}
                  {result.evidence.officialTargets
                    .map((target) => target?.name)
                    .filter(Boolean)
                    .join(', ')}
                </p>
              ) : null}
              {result.evidence.officialContextError ? <p>{result.evidence.officialContextError}</p> : null}
              {result.evidence.factCheckError ? <p>{result.evidence.factCheckError}</p> : null}
              {Array.isArray(result.evidence.officialContext) && result.evidence.officialContext.length ? (
                <ul className="evidence-list">
                  {result.evidence.officialContext.map((item, index) => (
                    <li key={`${item.url}-${index}`} className="evidence-item">
                      <div className="evidence-item-top">
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.title || item.url}
                        </a>
                      </div>
                      <span>
                        {item.name || item.domain || 'Official source'}
                        {item.snippet ? ` | ${item.snippet}` : ''}
                        {typeof item.similarity === 'number' ? ` | similarity ${item.similarity.toFixed(3)}` : ''}
                        {typeof item.keywordOverlap === 'number' ? ` | overlap ${item.keywordOverlap.toFixed(3)}` : ''}
                        {item.publishedAt ? ` | ${item.publishedAt}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No related official website context was found for this input.</p>
              )}
            </div>

            <div className="evidence-card">
              <h3>Regional Social Corroboration</h3>
              {result.evidence.socialContextError ? <p>{result.evidence.socialContextError}</p> : null}
              {Array.isArray(result.evidence.socialContext) && result.evidence.socialContext.length ? (
                <ul className="evidence-list">
                  {result.evidence.socialContext.map((item, index) => (
                    <li key={`${item.url}-${index}`} className="evidence-item">
                      <div className="evidence-item-top">
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.title || item.url}
                        </a>
                      </div>
                      <span>
                        {item.platform || 'Social'}
                        {item.snippet ? ` | ${item.snippet}` : ''}
                        {typeof item.similarity === 'number' ? ` | similarity ${item.similarity.toFixed(3)}` : ''}
                        {typeof item.keywordOverlap === 'number' ? ` | overlap ${item.keywordOverlap.toFixed(3)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No relevant social corroboration links were found for this query.</p>
              )}
            </div>

            {result?.imageVerification?.mode ? (
              <div className="evidence-card">
                <h3>Reverse-Image Evidence</h3>
                {result.imageVerification.sha256 ? <p>Image fingerprint (SHA-256): {result.imageVerification.sha256}</p> : null}
                {result?.duplicateImage?.isDuplicate ? (
                  <div className="duplicate-alert">
                    <strong>Duplicate Detected</strong>
                    <p>
                      Matching fingerprint found in {result.duplicateImage.count} previous upload(s) from your
                      history.
                    </p>
                    {Array.isArray(result.duplicateImage.items) && result.duplicateImage.items.length ? (
                      <ul className="duplicate-list">
                        {result.duplicateImage.items.map((item) => (
                          <li key={item.id}>
                            <span className={badgeClassByLabel(item.result)}>{item.result}</span>
                            <p>{item.fileName || item.text || 'Previous image verification record'}</p>
                            <small>{formatTime(item.createdAt)}</small>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : result?.duplicateImage?.sha256 ? (
                  <p>No duplicate fingerprint found in current history.</p>
                ) : null}
                {Array.isArray(result.imageVerification.reverseLookup?.candidateUrls) &&
                result.imageVerification.reverseLookup.candidateUrls.length ? (
                  <ul className="evidence-list">
                    {result.imageVerification.reverseLookup.candidateUrls.map((url, idx) => (
                      <li key={`${url}-${idx}`} className="evidence-item">
                        <a href={url} target="_blank" rel="noreferrer">
                          {url}
                        </a>
                        <span>Potential reuse context found via web reverse-image lookup.</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No candidate external URLs were extracted from reverse-image results yet.</p>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="dashboard-box">
          <div className="dashboard-card dashboard-card-full">
            <span>Recent Activity</span>
            {analytics.recentActivity.length ? (
              <ul className="activity-list">
                {analytics.recentActivity.map((item) => (
                  <li key={item.id} className="activity-item">
                    <span className={badgeClassByLabel(item.label)}>{item.label}</span>
                    <p>{item.text}</p>
                    <small>{formatTime(item.createdAt)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No recent activity yet. Saved checks will appear here automatically.</p>
            )}
          </div>
        </section>

        <section className="dashboard-box">
          <div className="dashboard-head">
            <h2>Trend Dashboard</h2>
            <span>Powered by saved analysis history</span>
          </div>

          <div className="dashboard-grid">
            <div className="dashboard-card">
              <span>Translated Inputs</span>
              <strong>{analytics.translatedCount}</strong>
              <p>Analyses where multilingual translation was applied before verification.</p>
            </div>

            <div className="dashboard-card">
              <span>Evidence-Backed Checks</span>
              <strong>{analytics.evidenceBackedCount}</strong>
              <p>Saved results with explainability snapshots and supporting evidence.</p>
            </div>

            <div className="dashboard-card dashboard-card-wide">
              <span>Label Distribution</span>
              {analytics.labelDistribution.length ? (
                <div className="mini-chart">
                  {analytics.labelDistribution.map((item) => (
                    <div key={item.label} className="mini-row">
                      <div className="mini-row-head">
                        <strong>{formatLabel(item.label)}</strong>
                        <span>{item.count}</span>
                      </div>
                      <div className="mini-track">
                        <div className="mini-fill mini-fill-primary" style={{ width: `${item.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No label analytics yet. Run a few analyses to populate trends.</p>
              )}
            </div>

            <div className="dashboard-card dashboard-card-wide">
              <span>Language Coverage</span>
              {analytics.languageDistribution.length ? (
                <div className="mini-chart">
                  {analytics.languageDistribution.map((item) => (
                    <div key={item.language} className="mini-row">
                      <div className="mini-row-head">
                        <strong>{item.language.toUpperCase()}</strong>
                        <span>{item.count}</span>
                      </div>
                      <div className="mini-track">
                        <div className="mini-fill mini-fill-secondary" style={{ width: `${item.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No language data yet. Analyze claims to see multilingual usage trends.</p>
              )}
            </div>
          </div>
        </section>

        <section className="history-box">
          <div className="history-head">
            <h2>Analysis History</h2>
            <button type="button" onClick={requestClearAll} disabled={!history.length} className="clear-all-btn">
              Clear All
            </button>
          </div>

          {historyLoading ? (
            <p className="history-empty">Loading history...</p>
          ) : !history.length ? (
            <p className="history-empty">No history yet. Run an analysis to save entries.</p>
          ) : (
            <ul className="history-list">
              {history.map((entry) => (
                <li key={entry.id} className="history-item">
                  <div className="history-item-top">
                    <div className="history-copy">
                      <p className="history-text">{entry.text}</p>
                      <p className="history-reason">{entry.reason || 'No explanation saved.'}</p>
                      <div className="history-audit">
                        {entry.language ? <span>Lang: {entry.language}</span> : null}
                        {entry.translationApplied ? <span>Translated</span> : null}
                        {entry.recencyMode === 'one-week' ? <span>Window: 7d</span> : <span>Window: all</span>}
                        {entry.source ? <span>Fact-check source saved</span> : null}
                        {entry.evidence && Object.keys(entry.evidence).length ? <span>Evidence snapshot saved</span> : null}
                      </div>
                    </div>
                    <div className="history-action-row">
                      <button
                        type="button"
                        className="view-item-btn"
                        onClick={() => showHistoryDetails(entry)}
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        className="delete-item-btn"
                        onClick={() => requestDeleteItem(entry)}
                        aria-label="Delete this history item"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="history-meta">
                    <span className={badgeClassByLabel(entry.result)}>{entry.result}</span>
                    <span>
                      {typeof entry.similarity === 'number' ? `Decision ${entry.similarity.toFixed(3)} | ` : ''}
                      {typeof entry.factCheckSimilarity === 'number' ? `Fact ${entry.factCheckSimilarity.toFixed(3)} | ` : ''}
                      {typeof entry.liveNewsSimilarity === 'number' ? `Live ${entry.liveNewsSimilarity.toFixed(3)} | ` : ''}
                      {typeof entry.officialContextSimilarity === 'number' ? `Official ${entry.officialContextSimilarity.toFixed(3)} | ` : ''}
                      {typeof entry.officialContextRelevance === 'number' ? `OfficialPriority ${entry.officialContextRelevance.toFixed(3)} | ` : ''}
                      {typeof entry.socialContextSimilarity === 'number' ? `Social ${entry.socialContextSimilarity.toFixed(3)} | ` : ''}
                      {formatTime(entry.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {confirmDialog.open ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Confirm delete action">
          <div className="confirm-card">
            <h3>{confirmDialog.mode === 'all' ? 'Clear all history?' : 'Delete this history item?'}</h3>
            <p>
              {confirmDialog.mode === 'all'
                ? 'This will permanently remove all saved history entries from Firebase.'
                : 'This will permanently remove this history entry from Firebase.'}
            </p>
            {confirmDialog.mode === 'single' ? (
              <p className="confirm-preview">"{confirmDialog.textPreview}"</p>
            ) : null}
            <div className="confirm-actions">
              <button type="button" className="ghost-btn" onClick={closeConfirm}>
                Cancel
              </button>
              <button type="button" className="danger-btn" onClick={runConfirmedAction}>
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;

