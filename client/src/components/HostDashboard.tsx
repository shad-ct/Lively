import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Users, Code, Share2, AlertTriangle, Play, CheckCircle2, 
  Copy, Check, ShieldAlert, FileUp, Plus, Minus, Power, X, Zap
} from 'lucide-react';

interface Attendee {
  id: string;
  name: string;
  isLost: boolean;
  score: number;
  correctAnswersCount: number;
  isOnline?: boolean;
}

interface ResourceItem {
  _id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
}

interface PollResult {
  option: string;
  votes: number;
}

interface ConfusionPoint {
  timestamp: string;
  lostCount: number;
  totalCount: number;
  percentage: number;
}

interface QuizLeaderboardItem {
  id: string;
  name: string;
  score: number;
  correctAnswersCount: number;
}

interface HostDashboardProps {
  roomCode: string;
  socket: any;
  onEndSession: () => void;
}

export const HostDashboard: React.FC<HostDashboardProps> = ({
  roomCode,
  socket,
  onEndSession,
}) => {
  const [activeTab, setActiveTab] = useState<'metrics' | 'broadcast' | 'resources' | 'polls' | 'quiz'>('metrics');
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Buzz alert roster selection states
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);

  // Broadcast tab states
  const [snippetText, setSnippetText] = useState('');
  const [broadcastHistory, setBroadcastHistory] = useState<string[]>([]);
  
  // Resource tab states
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<ResourceItem[]>([]);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll states
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [isPollActive, setIsPollActive] = useState(false);
  const [livePollResults, setLivePollResults] = useState<PollResult[]>([]);
  const [pastPolls, setPastPolls] = useState<{ question: string; results: PollResult[] }[]>([]);

  // Confusion states
  const [confusion, setConfusion] = useState({ lostCount: 0, totalCount: 0, percentage: 0 });
  const [confusionHistory, setConfusionHistory] = useState<ConfusionPoint[]>([]);
  const [isFrozen, setIsFrozen] = useState(false);

  // Gamified Quiz states
  const [quizQuestions, setQuizQuestions] = useState<any[]>([
    {
      questionText: "Which HTTP status code represents 'Internal Server Error'?",
      options: ["400 Bad Request", "401 Unauthorized", "500 Internal Error", "404 Not Found"],
      correctOptionIndex: 2,
      timeLimit: 15
    },
    {
      questionText: "What does the 'M' in MERN stack stand for?",
      options: ["MySQL", "MongoDB", "MariaDB", "Memcached"],
      correctOptionIndex: 1,
      timeLimit: 15
    },
    {
      questionText: "Which hook is used to handle side-effects in React?",
      options: ["useState", "useContext", "useEffect", "useMemo"],
      correctOptionIndex: 2,
      timeLimit: 15
    }
  ]);

  const [showQuizCreator, setShowQuizCreator] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionOptions, setNewQuestionOptions] = useState(['', '', '', '']);
  const [newQuestionCorrectIndex, setNewQuestionCorrectIndex] = useState(0);
  const [newQuestionTimeLimit, setNewQuestionTimeLimit] = useState(15);

  const [activeQuizQuestionIndex, setActiveQuizQuestionIndex] = useState<number | null>(null);
  const [quizTimeLeft, setQuizTimeLeft] = useState(15);
  const [quizSubmissions, setQuizSubmissions] = useState({ answered: 0, total: 0 });
  const [isQuizActive, setIsQuizActive] = useState(false);
  
  // Post-quiz results display
  const [quizResults, setQuizResults] = useState<{
    questionIndex: number;
    optionDistribution: number[];
    leaderboard: QuizLeaderboardItem[];
  } | null>(null);

  // WebSocket listeners
  useEffect(() => {
    if (!socket) return;

    // Fetch initial quiz questions from the server
    socket.emit('get_quiz_questions', (res: any) => {
      if (res && res.success && res.questions) {
        setQuizQuestions(res.questions);
      }
    });

    // Attendance Updates
    socket.on('attendee_roster_update', (roster: Attendee[]) => {
      setAttendees(roster);
    });

    // Confusion Meter Updates
    socket.on('confusion_update', (data: { lostCount: number; totalCount: number; percentage: number; history: ConfusionPoint[] }) => {
      setConfusion({
        lostCount: data.lostCount,
        totalCount: data.totalCount,
        percentage: data.percentage,
      });
      setConfusionHistory(data.history || []);
    });

    // Live Poll Results
    socket.on('poll_results_update', (results: PollResult[]) => {
      setLivePollResults(results);
    });

    // Initialize state checks
    socket.on('room_freeze_status', (frozen: boolean) => {
      setIsFrozen(frozen);
    });

    // Quiz tick from server countdown
    socket.on('quiz_tick', ({ timeLeft }: { timeLeft: number }) => {
      setQuizTimeLeft(timeLeft);
    });

    // Quiz answer update from server
    socket.on('attendee_quiz_answered', ({ submittedCount, totalCount }: { submittedCount: number; totalCount: number }) => {
      setQuizSubmissions({ answered: submittedCount, total: totalCount });
    });

    // Quiz results and leaderboard update at question end
    socket.on('quiz_leaderboard_update', (results: {
      questionIndex: number;
      optionDistribution: number[];
      leaderboard: QuizLeaderboardItem[];
    }) => {
      setQuizResults(results);
      setIsQuizActive(false);
    });

    return () => {
      socket.off('attendee_roster_update');
      socket.off('confusion_update');
      socket.off('poll_results_update');
      socket.off('room_freeze_status');
      socket.off('quiz_tick');
      socket.off('attendee_quiz_answered');
      socket.off('quiz_leaderboard_update');
    };
  }, [socket]);

  // Copy helpers
  const shareUrl = `${window.location.origin}/room/${roomCode}`;

  const copyToClipboard = (text: string, isCode: boolean) => {
    navigator.clipboard.writeText(text);
    if (isCode) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Broadcast snippet logic
  const handleBroadcast = () => {
    if (!snippetText.trim()) return;
    socket.emit('broadcast_snippet', snippetText);
    setBroadcastHistory([snippetText, ...broadcastHistory]);
    setSnippetText('');
  };

  // File upload logic
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionCode', roomCode);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Server returned error during file upload.');
      }

      const data = await response.json();
      if (data.success && data.resource) {
        setUploadedFiles([data.resource, ...uploadedFiles]);
      } else {
        setUploadError(data.error || 'Upload failed');
      }
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'Error uploading file.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const pushResourceToAudience = (resource: ResourceItem) => {
    socket.emit('push_resource', {
      fileName: resource.fileName,
      fileUrl: resource.fileUrl,
      mimeType: resource.mimeType,
    });
  };

  // Poll logic
  const addPollOption = () => {
    if (pollOptions.length < 5) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const removePollOption = () => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.slice(0, -1));
    }
  };

  const updatePollOption = (index: number, val: string) => {
    const updated = [...pollOptions];
    updated[index] = val;
    setPollOptions(updated);
  };

  const handleLaunchPoll = () => {
    const validOptions = pollOptions.filter(o => o.trim() !== '');
    if (!pollQuestion.trim() || validOptions.length < 2) return;

    socket.emit('launch_poll', {
      question: pollQuestion,
      options: validOptions,
    }, (res: any) => {
      if (res && res.success) {
        setIsPollActive(true);
        setLivePollResults(validOptions.map(option => ({ option, votes: 0 })));
      }
    });
  };

  const handleEndPoll = () => {
    socket.emit('end_poll', (res: any) => {
      if (res && res.success) {
        setPastPolls([{ question: pollQuestion, results: livePollResults }, ...pastPolls]);
        setIsPollActive(false);
        setPollQuestion('');
        setPollOptions(['', '']);
      }
    });
  };

  // Screen freeze logic
  const handleToggleFreeze = () => {
    socket.emit('toggle_room_freeze', (res: any) => {
      if (res && res.success) {
        setIsFrozen(res.isFrozen);
      }
    });
  };

  // Roster Checkbox Selection
  const toggleSelectAttendee = (id: string) => {
    if (selectedAttendees.includes(id)) {
      setSelectedAttendees(selectedAttendees.filter(item => item !== id));
    } else {
      setSelectedAttendees([...selectedAttendees, id]);
    }
  };

  const toggleSelectAllAttendees = () => {
    if (selectedAttendees.length === attendees.length) {
      setSelectedAttendees([]);
    } else {
      setSelectedAttendees(attendees.map(a => a.id));
    }
  };

  // Buzz Attention logic
  const handleBuzz = (buzzAll: boolean) => {
    socket.emit('buzz_users', {
      attendeeIds: buzzAll ? [] : selectedAttendees,
      buzzAll
    });
    // Clear selection after buzz
    if (!buzzAll) {
      setSelectedAttendees([]);
    }
  };

  // Quiz logic
  const handleLaunchQuizQuestion = (index: number) => {
    setQuizResults(null);
    setActiveQuizQuestionIndex(index);
    setQuizTimeLeft(quizQuestions[index].timeLimit);
    setQuizSubmissions({ answered: 0, total: attendees.length });
    setIsQuizActive(true);
    setActiveTab('quiz');

    socket.emit('launch_quiz_question', { questionIndex: index }, (res: any) => {
      if (!res || !res.success) {
        alert(res?.error || 'Failed to launch question');
        setIsQuizActive(false);
        setActiveQuizQuestionIndex(null);
      }
    });
  };

  const handleEndQuizQuestion = () => {
    socket.emit('end_quiz_question', (res: any) => {
      if (!res || !res.success) {
        alert('Failed to end quiz question');
      }
    });
  };

  const handleAddCustomQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const validOptions = newQuestionOptions.filter(o => o.trim() !== '');
    if (!newQuestionText.trim() || validOptions.length < 2) {
      alert('Please provide a question and at least 2 valid options.');
      return;
    }

    socket.emit('add_quiz_question', {
      questionText: newQuestionText.trim(),
      options: validOptions,
      correctOptionIndex: newQuestionCorrectIndex,
      timeLimit: newQuestionTimeLimit,
    }, (res: any) => {
      if (res && res.success) {
        setQuizQuestions([...quizQuestions, res.question]);
        // Reset form inputs
        setNewQuestionText('');
        setNewQuestionOptions(['', '', '', '']);
        setNewQuestionCorrectIndex(0);
        setNewQuestionTimeLimit(15);
        setShowQuizCreator(false);
      } else {
        alert(res?.error || 'Failed to add custom question.');
      }
    });
  };

  // Render SVG Confusion Line Chart
  const renderConfusionChart = () => {
    if (confusionHistory.length < 2) {
      return (
        <div className="h-48 flex items-center justify-center text-zinc-600 border border-dashed border-zinc-900 rounded-xl bg-zinc-950/20">
          <span className="text-xs font-semibold uppercase tracking-widest">Awaiting active data streams...</span>
        </div>
      );
    }

    const width = 500;
    const height = 180;
    const padding = 20;

    const points = confusionHistory.map((p, idx) => {
      const x = padding + (idx / (confusionHistory.length - 1)) * (width - padding * 2);
      const y = height - padding - (p.percentage / 100) * (height - padding * 2);
      return { x, y };
    });

    const pathData = points.reduce((acc, p, idx) => {
      return acc + (idx === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
    }, '');

    const areaData = pathData + ` L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return (
      <div className="w-full overflow-hidden bg-zinc-950/30 border border-zinc-900 rounded-2xl p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          {/* Grid lines */}
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#18181b" strokeDasharray="3,3" />
          <line x1={padding} y1={(height) / 2} x2={width - padding} y2={(height) / 2} stroke="#18181b" strokeDasharray="3,3" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#27272a" />
          
          {/* Y Axis Labels */}
          <text x={padding - 5} y={padding + 4} fill="#52525b" fontSize="8" fontWeight="bold" textAnchor="end">100%</text>
          <text x={padding - 5} y={(height) / 2 + 3} fill="#52525b" fontSize="8" fontWeight="bold" textAnchor="end">50%</text>
          <text x={padding - 5} y={height - padding + 3} fill="#52525b" fontSize="8" fontWeight="bold" textAnchor="end">0%</text>

          {/* Area Fill */}
          <path d={areaData} fill="url(#roseGradient)" opacity="0.1" />

          {/* Line Path */}
          <path d={pathData} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Glowing cursor on the last node */}
          {points.length > 0 && (
            <g>
              <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="5" fill="#f43f5e" />
              <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="10" fill="#f43f5e" opacity="0.3" className="animate-ping" />
            </g>
          )}

          {/* Gradients */}
          <defs>
            <linearGradient id="roseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  };

  const totalVotes = livePollResults.reduce((sum, r) => sum + r.votes, 0);

  // Symbol styles matching Kahoot styling
  const symbols = [
    { label: "▲", color: "bg-red-600 hover:bg-red-500 text-white" },
    { label: "♦", color: "bg-blue-600 hover:bg-blue-500 text-white" },
    { label: "●", color: "bg-yellow-500 hover:bg-yellow-400 text-zinc-950" },
    { label: "■", color: "bg-green-600 hover:bg-green-500 text-white" },
    { label: "★", color: "bg-violet-600 hover:bg-violet-500 text-white" }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-zinc-800 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-900 bg-zinc-900/10 backdrop-blur-md px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center text-zinc-950 font-extrabold text-base">
                P
              </div>
              <div>
                <h1 className="font-extrabold text-lg leading-none tracking-tight text-white">PresentSync Dashboard</h1>
                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">● Presentation Live</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Share Code / Join URL Widget */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 gap-3">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">ROOM CODE</span>
                <span className="font-mono text-sm font-bold tracking-widest text-white">{roomCode}</span>
              </div>
              <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
                <button
                  onClick={() => copyToClipboard(roomCode, true)}
                  className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Copy Code"
                >
                  {copiedCode ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => copyToClipboard(shareUrl, false)}
                  className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Copy Join Link"
                >
                  {copiedLink ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setShowQR(!showQR)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${showQR ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-850 text-zinc-350 hover:bg-zinc-800'}`}
                >
                  QR Code
                </button>
              </div>
            </div>

            {/* Global Freeze Switch */}
            <button
              onClick={handleToggleFreeze}
              className={`flex items-center gap-2 font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer shadow-lg ${
                isFrozen 
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/10 border border-rose-500' 
                  : 'bg-zinc-900 hover:bg-zinc-850 text-rose-500 hover:text-rose-400 border border-zinc-800'
              }`}
            >
              <Power className={`h-4 w-4 ${isFrozen ? 'animate-pulse' : ''}`} />
              <span>{isFrozen ? 'Screens Frozen' : 'Freeze Screens'}</span>
            </button>

            {/* End Session Button */}
            <button
              onClick={onEndSession}
              className="bg-zinc-900 hover:bg-zinc-850 hover:text-white text-zinc-400 border border-zinc-800 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              End Room
            </button>
          </div>
        </div>
      </header>

      {/* QR Code Quick-Overlay Modal */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-md">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl max-w-sm w-full relative mx-4 text-center shadow-2xl space-y-6 animate-scale-in">
            <button 
              onClick={() => setShowQR(false)} 
              className="absolute top-4 right-4 p-1 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-850 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Scan to Join Room</h3>
              <p className="text-zinc-400 text-xs font-mono">{shareUrl}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl inline-block shadow-lg mx-auto">
              <QRCodeSVG value={shareUrl} size={200} level="M" />
            </div>
            <div className="text-xs text-zinc-500">
              Point your smartphone camera at this screen to connect instantly.
            </div>
          </div>
        </div>
      )}

      {/* Main Grid Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column: Attendee Roster & Info */}
        <section className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-5 flex flex-col h-[400px] lg:h-full max-h-[600px] justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-950">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-zinc-400" />
                  <h2 className="font-bold text-sm text-white uppercase tracking-wider">Attendees</h2>
                </div>
                {attendees.length > 0 && (
                  <button 
                    onClick={toggleSelectAllAttendees} 
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold uppercase tracking-wider"
                  >
                    {selectedAttendees.length === attendees.length ? 'Clear' : 'Select All'}
                  </button>
                )}
              </div>

              <div className="overflow-y-auto max-h-[300px] lg:max-h-[400px] space-y-2 pr-1">
                {attendees.length === 0 ? (
                  <div className="text-center py-12 text-zinc-600 text-xs">
                    Awaiting attendees...
                  </div>
                ) : (
                  attendees.map(attendee => (
                    <div 
                      key={attendee.id}
                      className={`flex items-center justify-between p-3 rounded-xl border text-sm transition-all duration-300 ${
                        attendee.isOnline === false
                          ? 'bg-zinc-950/20 border-zinc-955/50 text-zinc-650 opacity-50'
                          : attendee.isLost 
                            ? 'bg-rose-950/20 border-rose-900/60 text-rose-200' 
                            : 'bg-zinc-950/50 border-zinc-900 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedAttendees.includes(attendee.id)}
                          onChange={() => toggleSelectAttendee(attendee.id)}
                          disabled={attendee.isOnline === false}
                          className="h-4 w-4 rounded border-zinc-800 bg-zinc-950 text-amber-500 focus:ring-amber-500/20 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <div className="truncate min-w-0">
                          <span className="font-medium block truncate">{attendee.name}</span>
                          <span className="text-[9px] text-zinc-500 block font-mono">Pts: {attendee.score || 0}</span>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-xs flex-shrink-0">
                        {attendee.isOnline === false ? (
                          <span className="h-2 w-2 rounded-full bg-zinc-700" title="Offline"></span>
                        ) : attendee.isLost ? (
                          <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" title="Lost"></span>
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-emerald-500" title="Online"></span>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {attendees.length > 0 && (
              <div className="pt-4 border-t border-zinc-950 mt-4 space-y-2">
                <button
                  onClick={() => handleBuzz(false)}
                  disabled={selectedAttendees.length === 0}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-bold text-xs uppercase tracking-widest py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Zap className="h-4 w-4 fill-zinc-950" />
                  <span>Buzz Selected ({selectedAttendees.length})</span>
                </button>
                <button
                  onClick={() => handleBuzz(true)}
                  className="w-full bg-zinc-950 hover:bg-zinc-900 text-amber-500 border border-zinc-900 font-bold text-xs uppercase tracking-widest py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Zap className="h-4 w-4" />
                  <span>Buzz All Devices</span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Right Columns: Main Command Panels */}
        <main className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Quick Stats & Live Confusion Meter Summary */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-900/40 border border-zinc-900 p-5 rounded-2xl flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active Audience Size</span>
                <p className="text-3xl font-extrabold text-white">{attendees.length}</p>
              </div>
              <Users className="h-8 w-8 text-zinc-700" />
            </div>

            <div className="bg-zinc-900/40 border border-zinc-900 p-5 rounded-2xl flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Confusion Level</span>
                <p className={`text-3xl font-extrabold ${confusion.percentage > 30 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {confusion.percentage}%
                </p>
              </div>
              <AlertTriangle className={`h-8 w-8 ${confusion.percentage > 30 ? 'text-rose-600 animate-bounce' : 'text-zinc-700'}`} />
            </div>

            <div className="bg-zinc-900/40 border border-zinc-900 p-5 rounded-2xl flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Session Leader</span>
                <p className="text-xl font-extrabold text-white truncate max-w-[150px]">
                  {attendees.length > 0 
                    ? [...attendees].sort((a,b) => b.score - a.score)[0].name
                    : 'N/A'}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-zinc-700" />
            </div>
          </section>

          {/* Control Section Tabs */}
          <section className="bg-zinc-900/40 border border-zinc-900 rounded-2xl flex-1 flex flex-col overflow-hidden min-h-[450px]">
            {/* Tab Selectors */}
            <div className="flex border-b border-zinc-950 bg-zinc-950/20">
              <button
                onClick={() => setActiveTab('metrics')}
                className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  activeTab === 'metrics' 
                    ? 'border-white text-white bg-zinc-900/50' 
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Audience Analytics
              </button>
              <button
                onClick={() => setActiveTab('broadcast')}
                className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  activeTab === 'broadcast' 
                    ? 'border-white text-white bg-zinc-900/50' 
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Code Broadcast
              </button>
              <button
                onClick={() => setActiveTab('resources')}
                className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  activeTab === 'resources' 
                    ? 'border-white text-white bg-zinc-900/50' 
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Resource Drops
              </button>
              <button
                onClick={() => setActiveTab('polls')}
                className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  activeTab === 'polls' 
                    ? 'border-white text-white bg-zinc-900/50' 
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Live Polling
              </button>
              <button
                onClick={() => setActiveTab('quiz')}
                className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  activeTab === 'quiz' 
                    ? 'border-white text-white bg-zinc-900/50' 
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Gamified Quiz
              </button>
            </div>

            {/* Tab Panels */}
            <div className="p-6 flex-1 flex flex-col justify-between overflow-y-auto">
              
              {/* METRICS PANEL */}
              {activeTab === 'metrics' && (
                <div className="space-y-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <h3 className="text-base font-bold text-white">Live Real-Time Confusion Meter</h3>
                    <p className="text-zinc-400 text-xs">
                      Visualizing active attendee status updates streamed dynamically every 500ms. Keep an eye on peaks to re-explain materials.
                    </p>
                  </div>
                  {renderConfusionChart()}
                  <div className="flex items-center gap-3 bg-zinc-950/40 border border-zinc-900 rounded-xl p-4 text-xs text-zinc-400">
                    <ShieldAlert className="h-5 w-5 text-rose-500 flex-shrink-0" />
                    <span>
                      <strong>Presenter Tip:</strong> If the confusion level climbs above 30%, consider pausing or using the <strong>Freeze Screens</strong> panic control at the top right to get eyes back on the primary screen.
                    </span>
                  </div>
                </div>
              )}

              {/* BROADCAST PANEL */}
              {activeTab === 'broadcast' && (
                <div className="space-y-6 flex-1 flex flex-col">
                  <div className="space-y-2">
                    <h3 className="text-base font-bold text-white">1-Click Code Snippet / Text Broadcast</h3>
                    <p className="text-zinc-400 text-xs">
                      Paste code snippets, terminal commands, or study notes. Broadcasts instantly trigger a copyable popup on attendee displays.
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col gap-4">
                    <textarea
                      placeholder="Paste your code snippet or notes here..."
                      value={snippetText}
                      onChange={(e) => setSnippetText(e.target.value)}
                      rows={6}
                      className="w-full flex-1 bg-zinc-950 border border-zinc-900 rounded-xl p-4 text-sm font-mono text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-zinc-800 transition-colors resize-none"
                    />

                    <button
                      onClick={handleBroadcast}
                      disabled={!snippetText.trim()}
                      className="bg-zinc-100 hover:bg-white text-zinc-950 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-40"
                    >
                      <Code className="h-4 w-4" />
                      <span>Broadcast to Room</span>
                    </button>
                  </div>

                  {broadcastHistory.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-zinc-950">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Recently Broadcasted</span>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {broadcastHistory.map((hist, idx) => (
                          <div key={idx} className="bg-zinc-950/60 border border-zinc-900 p-3 rounded-xl flex items-center justify-between text-xs text-zinc-400 font-mono">
                            <span className="truncate max-w-[400px]">{hist}</span>
                            <button
                              onClick={() => setSnippetText(hist)}
                              className="text-zinc-500 hover:text-white underline cursor-pointer"
                            >
                              Load
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* RESOURCES PANEL */}
              {activeTab === 'resources' && (
                <div className="space-y-6 flex-1 flex flex-col">
                  <div className="space-y-2">
                    <h3 className="text-base font-bold text-white">Synchronized Resource Drops</h3>
                    <p className="text-zinc-400 text-xs">
                      Drop PDFs, slides, or sample project files. Uploading files lets you push immediate download prompts directly to active attendee screens.
                    </p>
                  </div>

                  {/* Upload Block */}
                  <div className="bg-zinc-950/20 border border-dashed border-zinc-900 rounded-2xl p-6 text-center space-y-4">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <FileUp className="h-8 w-8 text-zinc-600 mx-auto" />
                    <div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold py-2 px-4 rounded-xl cursor-pointer inline-block transition-colors"
                      >
                        {uploading ? 'Uploading Asset...' : 'Choose File to Upload'}
                      </button>
                      <p className="text-zinc-500 text-[10px] mt-2">Max upload limit: 10MB per resource file</p>
                    </div>

                    {uploadError && (
                      <p className="text-xs font-semibold text-rose-500">{uploadError}</p>
                    )}
                  </div>

                  {/* Uploaded List */}
                  <div className="space-y-3 flex-1">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Available Resource Drops</span>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {uploadedFiles.length === 0 ? (
                        <div className="text-center py-6 text-zinc-700 text-xs border border-zinc-900 rounded-2xl bg-zinc-950/10">
                          No resources uploaded yet.
                        </div>
                      ) : (
                        uploadedFiles.map(file => (
                          <div 
                            key={file._id}
                            className="bg-zinc-950/60 border border-zinc-900 p-4 rounded-2xl flex items-center justify-between gap-4"
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-semibold text-white truncate">{file.fileName}</span>
                              <span className="text-[10px] text-zinc-500 truncate">{file.mimeType}</span>
                            </div>
                            <button
                              onClick={() => pushResourceToAudience(file)}
                              className="bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                              <span>Push to Room</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* POLLS PANEL */}
              {activeTab === 'polls' && (
                <div className="space-y-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <h3 className="text-base font-bold text-white">Live Multiple Choice Polling</h3>
                    <p className="text-zinc-400 text-xs">
                      Create a question. Launching a poll instantly overrides attendee screens to collect structured responses with real-time analytics.
                    </p>
                  </div>

                  {isPollActive ? (
                    /* Active Poll Monitor Screen */
                    <div className="border border-zinc-900 bg-zinc-950/20 p-5 rounded-2xl flex-1 flex flex-col justify-between gap-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="bg-violet-950 text-violet-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-violet-900 animate-pulse">
                            LIVE POLL RUNNING
                          </span>
                          <h4 className="text-lg font-bold text-white mt-2">{pollQuestion}</h4>
                        </div>
                        <span className="text-xs text-zinc-500 font-medium">{totalVotes} votes submitted</span>
                      </div>

                      {/* Bar chart displaying percentages */}
                      <div className="space-y-4 py-4 flex-1">
                        {livePollResults.map((res, idx) => {
                          const pct = totalVotes > 0 ? Math.round((res.votes / totalVotes) * 100) : 0;
                          return (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-zinc-300 font-semibold">
                                <span>{res.option}</span>
                                <span>{res.votes} votes ({pct}%)</span>
                              </div>
                              <div className="w-full bg-zinc-950 h-6 border border-zinc-900 rounded-lg overflow-hidden relative">
                                <div 
                                  className="bg-zinc-100 h-full transition-all duration-500 ease-out"
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        onClick={handleEndPoll}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>End Poll & Save Results</span>
                      </button>
                    </div>
                  ) : (
                    /* Poll Creation Form */
                    <div className="space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Question Title</label>
                          <input
                            type="text"
                            placeholder="What is the time complexity of lookup in a HashMap?"
                            value={pollQuestion}
                            onChange={(e) => setPollQuestion(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-800 transition-colors"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Answer Options</label>
                            <div className="flex gap-2">
                              <button 
                                type="button"
                                onClick={removePollOption}
                                disabled={pollOptions.length <= 2}
                                className="p-1 border border-zinc-900 rounded-lg hover:bg-zinc-900 text-zinc-400 disabled:opacity-40 cursor-pointer"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                type="button"
                                onClick={addPollOption}
                                disabled={pollOptions.length >= 5}
                                className="p-1 border border-zinc-900 rounded-lg hover:bg-zinc-900 text-zinc-400 disabled:opacity-40 cursor-pointer"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {pollOptions.map((opt, idx) => (
                            <input
                              key={idx}
                              type="text"
                              placeholder={`Option ${idx + 1}`}
                              value={opt}
                              onChange={(e) => updatePollOption(idx, e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-xs text-zinc-350 focus:outline-none focus:border-zinc-800 transition-colors"
                            />
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={handleLaunchPoll}
                        disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim() !== '').length < 2}
                        className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-40"
                      >
                        <Play className="h-4 w-4" />
                        <span>Launch Live Poll</span>
                      </button>
                    </div>
                  )}

                  {!isPollActive && pastPolls.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-zinc-950">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Past Poll Summaries</span>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {pastPolls.map((poll, idx) => (
                          <div key={idx} className="bg-zinc-950/40 border border-zinc-900 p-3 rounded-xl text-xs text-zinc-400">
                            <span className="font-semibold text-white block truncate mb-1">{poll.question}</span>
                            <span className="text-[10px] text-zinc-500">
                              Top Option: {poll.results.reduce((max, r) => r.votes > max.votes ? r : max, poll.results[0]).option}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* GAMIFIED QUIZ PANEL */}
              {activeTab === 'quiz' && (
                <div className="space-y-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <h3 className="text-base font-bold text-white font-sans flex items-center gap-2">
                      <Zap className="h-4 w-4 text-violet-400 fill-violet-400" />
                      <span>Live Gamified Quiz (Kahoot Style)</span>
                    </h3>
                    <p className="text-zinc-400 text-xs">
                      Run interactive technical quizzes. Points are scored based on answer correctness and response speed. Tallies leaderboards in real time.
                    </p>
                  </div>

                  {isQuizActive && activeQuizQuestionIndex !== null ? (
                    /* ACTIVE QUIZ HOST CONSOLE */
                    <div className="border border-zinc-900 bg-zinc-950/20 p-6 rounded-3xl flex-1 flex flex-col justify-between gap-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1.5">
                          <span className="bg-violet-950 text-violet-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-violet-900 animate-pulse uppercase tracking-wider">
                            QUIZ QUESTION ACTIVE
                          </span>
                          <h4 className="text-lg font-bold text-white mt-1">
                            Q{activeQuizQuestionIndex + 1}: {quizQuestions[activeQuizQuestionIndex].questionText}
                          </h4>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block">TIME LEFT</span>
                          <span className="text-3xl font-black font-mono text-violet-400">{quizTimeLeft}s</span>
                        </div>
                      </div>

                      {/* Attendee Submission Progress bar */}
                      <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl space-y-3 text-center">
                        <div className="flex justify-between items-center text-xs text-zinc-400">
                          <span className="font-semibold uppercase tracking-wider">Submissions Status</span>
                          <span className="font-mono font-bold text-white">{quizSubmissions.answered} / {quizSubmissions.total} Answered</span>
                        </div>
                        <div className="w-full bg-zinc-900 h-3 border border-zinc-800 rounded-full overflow-hidden relative">
                          <div 
                            className="bg-violet-500 h-full transition-all duration-300 ease-out"
                            style={{ width: `${quizSubmissions.total > 0 ? (quizSubmissions.answered / quizSubmissions.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>

                      <button
                        onClick={handleEndQuizQuestion}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Force End Question & Show Scores</span>
                      </button>
                    </div>
                  ) : quizResults ? (
                    /* POST QUIZ QUESTION RESULTS & LEADERBOARD */
                    <div className="border border-zinc-900 bg-zinc-950/20 p-6 rounded-3xl flex-1 flex flex-col gap-6">
                      <div className="space-y-1 pb-4 border-b border-zinc-950">
                        <h4 className="text-base font-bold text-white">
                          Question {quizResults.questionIndex + 1} Results
                        </h4>
                        <p className="text-xs text-zinc-500">Correct Answer: <span className="font-semibold text-emerald-400">{quizQuestions[quizResults.questionIndex].options[quizQuestions[quizResults.questionIndex].correctOptionIndex]}</span></p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* 1. Answers distribution */}
                        <div className="space-y-3 bg-zinc-950/30 border border-zinc-900 rounded-2xl p-4">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Response Distribution</span>
                          <div className="space-y-2">
                            {quizQuestions[quizResults.questionIndex].options.map((opt: string, idx: number) => {
                              const count = quizResults.optionDistribution[idx] || 0;
                              const total = quizResults.optionDistribution.reduce((a,b) => a+b, 0);
                              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                              const isCorrect = idx === quizQuestions[quizResults.questionIndex].correctOptionIndex;
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex justify-between text-xs font-semibold">
                                    <span className="truncate max-w-[150px]">{opt}</span>
                                    <span className={isCorrect ? 'text-emerald-400' : 'text-zinc-500'}>{count} ({pct}%)</span>
                                  </div>
                                  <div className="w-full bg-zinc-950 h-3 border border-zinc-900 rounded-full overflow-hidden relative">
                                    <div 
                                      className={`h-full ${isCorrect ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                                      style={{ width: `${pct}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 2. Top 5 Leaderboard */}
                        <div className="space-y-3 bg-zinc-950/30 border border-zinc-900 rounded-2xl p-4">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Leaderboard Standing</span>
                          <div className="space-y-2">
                            {quizResults.leaderboard.length === 0 ? (
                              <p className="text-xs text-zinc-600 text-center py-6">No answers received.</p>
                            ) : (
                              quizResults.leaderboard.map((item, idx) => {
                                const topScore = quizResults.leaderboard[0].score || 1;
                                const barWidth = Math.max(15, Math.round((item.score / topScore) * 100));
                                return (
                                  <div key={item.id} className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-zinc-500 w-4 font-mono">{idx + 1}.</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex justify-between text-xs font-semibold">
                                        <span className="truncate">{item.name}</span>
                                        <span className="font-mono text-zinc-400">{item.score} pts</span>
                                      </div>
                                      <div className="w-full bg-zinc-950 h-2 border border-zinc-900 rounded-full overflow-hidden relative">
                                        <div 
                                          className="bg-violet-500 h-full"
                                          style={{ width: `${barWidth}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Navigation back to question list */}
                      <button
                        onClick={() => setQuizResults(null)}
                        className="bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold uppercase tracking-wider py-3.5 rounded-xl cursor-pointer"
                      >
                        Back to Questions Roster
                      </button>
                    </div>
                  ) : (
                    /* QUIZ QUESTION SELECTION LIST */
                    <div className="space-y-4 flex-1">
                      <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Quiz Questions Stack</span>
                        <button
                          onClick={() => setShowQuizCreator(!showQuizCreator)}
                          className="bg-zinc-900 hover:bg-zinc-850 text-zinc-350 hover:text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-zinc-800"
                        >
                          {showQuizCreator ? 'Hide Creator' : '+ Add Custom Question'}
                        </button>
                      </div>

                      {showQuizCreator && (
                        <form onSubmit={handleAddCustomQuestion} className="bg-zinc-950/40 border border-zinc-900 p-5 rounded-2xl space-y-4 animate-scale-in">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Create Custom Quiz Question</h4>
                          
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Question Text</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. What is the time complexity of lookup in a HashMap?"
                              value={newQuestionText}
                              onChange={(e) => setNewQuestionText(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Answer Options & Correct Selection</label>
                            {newQuestionOptions.map((opt: string, idx: number) => (
                              <div key={idx} className="flex items-center gap-3">
                                <span className="text-xs font-bold text-zinc-500 w-4 text-center">{symbols[idx]?.label}</span>
                                <input
                                  type="text"
                                  required={idx < 2}
                                  placeholder={`Option ${idx + 1}`}
                                  value={opt}
                                  onChange={(e) => {
                                    const updated = [...newQuestionOptions];
                                    updated[idx] = e.target.value;
                                    setNewQuestionOptions(updated);
                                  }}
                                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-150 focus:outline-none focus:border-zinc-700 transition-colors"
                                />
                                <input
                                  type="radio"
                                  name="correctOptionIndex"
                                  checked={newQuestionCorrectIndex === idx}
                                  onChange={() => setNewQuestionCorrectIndex(idx)}
                                  className="h-4 w-4 text-violet-500 focus:ring-violet-500/20 cursor-pointer"
                                  title="Mark as correct answer"
                                />
                              </div>
                            ))}
                          </div>

                          <div className="flex gap-4">
                            <div className="flex-1 space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Time Limit (seconds)</label>
                              <input
                                type="number"
                                min={5}
                                max={60}
                                value={newQuestionTimeLimit}
                                onChange={(e) => setNewQuestionTimeLimit(Number(e.target.value))}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors"
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                type="submit"
                                className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs uppercase tracking-widest py-3 px-6 rounded-xl cursor-pointer transition-colors"
                              >
                                Save Question
                              </button>
                            </div>
                          </div>
                        </form>
                      )}

                      <div className="space-y-3">
                        {quizQuestions.map((q: any, index: number) => (
                          <div 
                            key={index}
                            className="bg-zinc-950/60 border border-zinc-900 p-4 rounded-2xl flex items-center justify-between gap-4"
                          >
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="bg-zinc-900 text-zinc-400 border border-zinc-800 text-[10px] font-bold px-2 py-0.5 rounded-md font-mono">
                                  Q{index + 1}
                                </span>
                                <span className="text-xs text-zinc-500">{q.timeLimit}s Time limit</span>
                              </div>
                              <h4 className="text-sm font-semibold text-white truncate">{q.questionText}</h4>
                              <div className="flex gap-2 flex-wrap">
                                {q.options.map((opt: string, optIdx: number) => (
                                  <span 
                                    key={optIdx} 
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                      optIdx === q.correctOptionIndex 
                                        ? 'bg-emerald-950/20 border-emerald-900 text-emerald-400' 
                                        : 'bg-zinc-900/40 border-zinc-950 text-zinc-500'
                                    }`}
                                  >
                                    {symbols[optIdx]?.label} {opt}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <button
                              onClick={() => handleLaunchQuizQuestion(index)}
                              className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-transform hover:scale-[1.03] active:scale-[0.97] flex-shrink-0 shadow-lg shadow-violet-600/10"
                            >
                              <Play className="h-3.5 w-3.5 fill-white" />
                              <span>Launch</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
