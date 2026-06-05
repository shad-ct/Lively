import React, { useState, useEffect } from 'react';
import { 
  Copy, Check, FileDown, HelpCircle, FileText, 
  CheckCircle, Smartphone, Zap, X
} from 'lucide-react';

interface AttendeeViewProps {
  roomCode: string;
  attendeeName: string;
  socket: any;
  onLeave: () => void;
  initialState: {
    isFrozen: boolean;
    activePoll: { question: string; options: string[] } | null;
    activeQuiz: {
      questionIndex: number;
      questionText: string;
      options: string[];
      timeLimit: number;
      timeLeft: number;
      hasVoted: boolean;
    } | null;
    quizQuestionsCount: number;
  };
}

export const AttendeeView: React.FC<AttendeeViewProps> = ({
  roomCode,
  attendeeName,
  socket,
  onLeave,
  initialState,
}) => {
  // Screen freeze
  const [isFrozen, setIsFrozen] = useState(initialState.isFrozen);

  // Poll states
  const [activePoll, setActivePoll] = useState<{ question: string; options: string[] } | null>(initialState.activePoll);
  const [hasVotedPoll, setHasVotedPoll] = useState(false);
  const [selectedPollIndex, setSelectedPollIndex] = useState<number | null>(null);

  // Confusion toggle states
  const [isLost, setIsLost] = useState(false);
  const [isSyncingLost, setIsSyncingLost] = useState(false);

  // Broadcast code snippet popups
  const [broadcastSnippet, setBroadcastSnippet] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Shared file resources popup
  const [pushedResource, setPushedResource] = useState<{ fileName: string; fileUrl: string; mimeType: string } | null>(null);

  // Host Buzz Attention Alert states
  const [isBuzzed, setIsBuzzed] = useState(false);

  // Gamified Quiz states
  const [activeQuiz, setActiveQuiz] = useState<{
    questionIndex: number;
    questionText: string;
    options: string[];
    timeLimit: number;
    timeLeft: number;
  } | null>(initialState.activeQuiz);
  const [hasVotedQuiz, setHasVotedQuiz] = useState(initialState.activeQuiz ? initialState.activeQuiz.hasVoted : false);
  const [selectedQuizIndex, setSelectedQuizIndex] = useState<number | null>(null);



  // Quiz results feedback states
  const [quizFeedBack, setQuizFeedBack] = useState<{
    isCorrect: boolean;
    scoreAdded: number;
    totalScore: number;
    correctOptionIndex: number;
    rank: number;
  } | null>(null);

  // Socket routing and listener hooks
  useEffect(() => {
    if (!socket) return;

    // Listen to screen freezing status
    socket.on('room_freeze_status', (frozen: boolean) => {
      setIsFrozen(frozen);
    });

    // Listen to incoming code snippets
    socket.on('receive_snippet', (snippet: string) => {
      setBroadcastSnippet(snippet);
      setCopiedSnippet(false);
    });

    // Listen to resource pushes
    socket.on('receive_resource', (resource: { fileName: string; fileUrl: string; mimeType: string }) => {
      setPushedResource(resource);
    });

    // Listen to attention buzz triggers
    socket.on('receive_buzz', () => {
      setIsBuzzed(true);
      // Attempt device vibration
      try {
        if ('vibrate' in navigator) {
          navigator.vibrate([200, 100, 200, 100, 300]);
        }
      } catch (err) {
        console.warn('Vibration API blocked or not supported on this browser context:', err);
      }
    });

    // Listen to poll announcements
    socket.on('poll_launched', (poll: { question: string; options: string[] }) => {
      setActivePoll(poll);
      setHasVotedPoll(false);
      setSelectedPollIndex(null);
    });

    // Listen to poll closing notifications
    socket.on('poll_ended', () => {
      setActivePoll(null);
      setHasVotedPoll(false);
      setSelectedPollIndex(null);
    });

    // --- LIVE QUIZ SOCKET EVENTS ---
    socket.on('quiz_question_launched', (quiz: {
      questionIndex: number;
      questionText: string;
      options: string[];
      timeLimit: number;
    }) => {
      setQuizFeedBack(null);
      setActiveQuiz({
        ...quiz,
        timeLeft: quiz.timeLimit
      });
      setHasVotedQuiz(false);
      setSelectedQuizIndex(null);
    });

    socket.on('quiz_tick', ({ timeLeft }: { timeLeft: number }) => {
      setActiveQuiz(prev => prev ? { ...prev, timeLeft } : null);
    });

    socket.on('quiz_question_ended', (feedback: {
      isCorrect: boolean;
      scoreAdded: number;
      totalScore: number;
      correctOptionIndex: number;
      rank: number;
    }) => {
      setQuizFeedBack(feedback);
      setActiveQuiz(null);
    });

    // Close screen if session is terminated by presenter
    socket.on('session_ended', () => {
      alert('This presenter room session has ended.');
      onLeave();
    });

    return () => {
      socket.off('room_freeze_status');
      socket.off('receive_snippet');
      socket.off('receive_resource');
      socket.off('receive_buzz');
      socket.off('poll_launched');
      socket.off('poll_ended');
      socket.off('quiz_question_launched');
      socket.off('quiz_tick');
      socket.off('quiz_question_ended');
      socket.off('session_ended');
    };
  }, [socket, onLeave]);

  // Handle confusion state toggle
  const handleToggleConfusion = () => {
    if (isSyncingLost) return;
    const targetState = !isLost;

    setIsLost(targetState);
    setIsSyncingLost(true);

    // Emit event
    socket.emit('update_understanding_status', targetState);

    // Rate limiting delay
    setTimeout(() => {
      setIsSyncingLost(false);
    }, 500);
  };

  const copySnippetToClipboard = () => {
    if (!broadcastSnippet) return;
    navigator.clipboard.writeText(broadcastSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const submitPollVote = (index: number) => {
    if (hasVotedPoll) return;
    setSelectedPollIndex(index);
    setHasVotedPoll(true);
    socket.emit('submit_poll_vote', index);
  };

  const submitQuizAnswer = (index: number) => {
    if (hasVotedQuiz) return;
    setSelectedQuizIndex(index);
    setHasVotedQuiz(true);
    socket.emit('submit_quiz_answer', { optionIndex: index });
  };

  const dismissBuzz = () => {
    setIsBuzzed(false);
  };

  // Symbols for Kahoot style buttons
  const symbols = [
    { label: "▲", color: "bg-red-600 hover:bg-red-500 text-white shadow-red-600/10 border-red-500" },
    { label: "♦", color: "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/10 border-blue-500" },
    { label: "●", color: "bg-yellow-500 hover:bg-yellow-400 text-zinc-950 shadow-yellow-500/10 border-yellow-450" },
    { label: "■", color: "bg-green-600 hover:bg-green-500 text-white shadow-green-600/10 border-green-500" }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between selection:bg-zinc-800 selection:text-white relative overflow-hidden">
      
      {/* 1. Host Buzz Attention Flash Overlay */}
      {isBuzzed && (
        <div className="fixed inset-0 z-50 bg-rose-950/95 flex flex-col items-center justify-center p-6 text-center select-none animate-pulse">
          <div className="bg-zinc-950/90 border-2 border-rose-500 p-8 rounded-3xl max-w-sm w-full space-y-6 shadow-2xl relative">
            <div className="h-16 w-16 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto text-rose-500 border border-rose-500">
              <Zap className="h-8 w-8 fill-rose-500 animate-bounce" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white uppercase tracking-wider">Attention Request</h2>
              <p className="text-zinc-400 text-sm font-medium">
                The presenter is requesting your immediate attention on the front screen.
              </p>
            </div>
            <button
              onClick={dismissBuzz}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl cursor-pointer transition-colors text-sm uppercase tracking-widest shadow-lg shadow-rose-600/25"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* 2. Absolute Screen Freeze overlay */}
      {isFrozen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/95 blur-overlay-transition flex flex-col items-center justify-center text-center p-6 select-none">
          <div className="space-y-6 max-w-sm">
            <div className="relative inline-block">
              <Smartphone className="h-16 w-16 text-rose-500 animate-bounce mx-auto" />
              <div className="absolute inset-0 bg-rose-500 rounded-full scale-110 opacity-15 animate-freeze-pulse"></div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white tracking-tight">Screens Frozen</h2>
              <p className="text-zinc-400 text-sm font-medium">
                The presenter has locked client devices. Please look up at the front screen now.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-900/10 backdrop-blur-md px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 bg-zinc-100 rounded-md flex items-center justify-center text-zinc-950 font-bold text-sm">
            L
          </div>
          <span className="font-extrabold text-sm tracking-tight text-white">Lively Client</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-[10px] text-zinc-500 font-bold block leading-none">{attendeeName}</span>
            <span className="text-[9px] font-mono text-zinc-400 font-semibold tracking-wider">ROOM: {roomCode}</span>
          </div>
          <button 
            onClick={onLeave} 
            className="text-[10px] bg-zinc-900 hover:bg-zinc-850 hover:text-white text-zinc-500 border border-zinc-850 px-2 py-1 rounded-lg transition-colors cursor-pointer"
          >
            Leave
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto p-4 gap-6 z-10">
        
        {/* ACTIVE POLL VIEW - Full View Override */}
        {activePoll && !activeQuiz && (
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-6 shadow-2xl backdrop-blur-md space-y-6 animate-scale-in">
            <div className="flex items-center gap-2 text-zinc-400">
              <CheckCircle className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-bold uppercase tracking-wider">Active Room Poll</span>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white tracking-tight">{activePoll.question}</h3>
              <p className="text-xs text-zinc-400">Select an option to cast your vote instantly.</p>
            </div>

            <div className="space-y-3">
              {activePoll.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => submitPollVote(idx)}
                  disabled={hasVotedPoll}
                  className={`w-full text-left p-4 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${
                    hasVotedPoll
                      ? idx === selectedPollIndex
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                        : 'bg-zinc-950/20 border-zinc-900 text-zinc-600'
                      : 'bg-zinc-950/50 hover:bg-zinc-900 border-zinc-800 text-zinc-300 hover:scale-[1.01]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{option}</span>
                    {hasVotedPoll && idx === selectedPollIndex && (
                      <span className="text-[10px] bg-zinc-950 text-white font-bold px-2 py-0.5 rounded-md">Voted</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {hasVotedPoll && (
              <p className="text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider animate-pulse">
                Vote recorded. Waiting for presenter...
              </p>
            )}
          </div>
        )}

        {/* ACTIVE GAMIFIED QUIZ QUESTION VIEW - Full View Override */}
        {activeQuiz && (
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-3xl p-6 shadow-2xl backdrop-blur-md space-y-6 animate-scale-in">
            <div className="flex justify-between items-center text-zinc-400">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-violet-400 fill-violet-400" />
                <span>Quiz Question {activeQuiz.questionIndex + 1}</span>
              </span>
              <span className="text-2xl font-black font-mono text-violet-400">{activeQuiz.timeLeft}s</span>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white tracking-tight">
                {activeQuiz.questionText}
              </h3>
              <p className="text-xs text-zinc-500">Tap options rapidly to maximize speed scores!</p>
            </div>

            {hasVotedQuiz ? (
              /* Waiting Screen after submit */
              <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-8 text-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
                  <CheckCircle className="h-6 w-6 text-violet-400" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Answer Submitted!</h4>
                  <p className="text-xs text-zinc-500 mt-1">
                    {selectedQuizIndex !== null ? `You selected: "${activeQuiz.options[selectedQuizIndex]}". ` : ''}
                    Waiting for other players to finish...
                  </p>
                </div>
              </div>
            ) : (
              /* Colored options button list (Kahoot-style) */
              <div className="grid grid-cols-2 gap-3">
                {activeQuiz.options.map((option, idx) => {
                  const symbol = symbols[idx] || symbols[0];
                  return (
                    <button
                      key={idx}
                      onClick={() => submitQuizAnswer(idx)}
                      className={`h-28 rounded-2xl border text-left p-4 flex flex-col justify-between font-bold cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ${symbol.color}`}
                    >
                      <span className="text-2xl leading-none font-bold">{symbol.label}</span>
                      <span className="text-xs font-bold leading-tight break-all line-clamp-3">{option}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* POST QUIZ QUESTION FEEDBACK SCREEN */}
        {quizFeedBack && (
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-3xl p-6 shadow-2xl backdrop-blur-md space-y-6 text-center animate-scale-in">
            {quizFeedBack.isCorrect ? (
              /* Correct display */
              <div className="space-y-4">
                <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                  <Check className="h-8 w-8 stroke-[3]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-emerald-400 uppercase tracking-wide">Correct!</h3>
                  <p className="text-3xl font-black font-mono text-white mt-2">+{quizFeedBack.scoreAdded}</p>
                  <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Speed points awarded</p>
                </div>
              </div>
            ) : (
              /* Incorrect display */
              <div className="space-y-4">
                <div className="h-16 w-16 bg-rose-500/10 border border-rose-500 rounded-full flex items-center justify-center mx-auto text-rose-400">
                  <X className="h-8 w-8 stroke-[3]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-rose-500 uppercase tracking-wide">Incorrect</h3>
                  <p className="text-xs text-zinc-400 mt-2">
                    Correct Option: <span className="font-semibold text-emerald-400">
                      {initialState.activeQuiz 
                        ? 'Check Presenter Screen' 
                        : 'Review Correct Choice'}
                    </span>
                  </p>
                </div>
              </div>
            )}

            <div className="border-t border-zinc-900 pt-5 grid grid-cols-2 gap-4 text-xs font-semibold">
              <div className="bg-zinc-950/50 border border-zinc-900 p-3 rounded-2xl">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 block mb-1">TOTAL SCORE</span>
                <span className="text-lg font-bold font-mono text-white">{quizFeedBack.totalScore} pts</span>
              </div>
              <div className="bg-zinc-950/50 border border-zinc-900 p-3 rounded-2xl">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 block mb-1">CURRENT RANK</span>
                <span className="text-lg font-bold font-mono text-violet-400">#{quizFeedBack.rank}</span>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider animate-pulse pt-2">
              Ready for the next question...
            </p>
          </div>
        )}

        {/* DEFAULT ATTENDEE HUB */}
        {!activePoll && !activeQuiz && !quizFeedBack && (
          <div className="space-y-6">
            
            {/* Status card */}
            <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-6 text-center space-y-4">
              <Smartphone className="h-10 w-10 text-zinc-650 mx-auto animate-pulse" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">Interactive Connection Live</h3>
                <p className="text-zinc-500 text-xs px-4">
                  Keep this tab open. Real-time file drops, quizzes, and snippets will automatically appear on this screen.
                </p>
              </div>
            </div>

            {/* Awaiting stream placeholder */}
            {!broadcastSnippet && !pushedResource && (
              <div className="border border-dashed border-zinc-900 rounded-2xl p-8 text-center text-zinc-600 text-xs">
                Awaiting broadcasts from presenter...
              </div>
            )}
          </div>
        )}

        {/* CODE SNIPPET BROADCAST MODAL POPUP */}
        {broadcastSnippet && (
          <div className="fixed inset-0 z-40 bg-zinc-950/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl relative animate-scale-in">
              <button
                onClick={() => setBroadcastSnippet(null)}
                className="absolute top-4 right-4 p-1 rounded-lg text-zinc-500 hover:text-zinc-105 hover:bg-zinc-850 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-violet-400"></span>
                  Code Broadcast
                </span>
                <span className="text-[10px] text-zinc-400 font-semibold">Just sent</span>
              </div>

              <div className="bg-zinc-950 border border-zinc-950 rounded-xl p-4 overflow-x-auto max-h-56">
                <pre className="text-xs font-mono text-zinc-350 select-text whitespace-pre-wrap break-all">
                  {broadcastSnippet}
                </pre>
              </div>

              <button
                onClick={copySnippetToClipboard}
                className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {copiedSnippet ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copy to Clipboard</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* RESOURCE DROP MODAL POPUP */}
        {pushedResource && (
          <div className="fixed inset-0 z-45 bg-zinc-950/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl relative animate-scale-in">
              <button
                onClick={() => setPushedResource(null)}
                className="absolute top-4 right-4 p-1 rounded-lg text-zinc-500 hover:text-zinc-105 hover:bg-zinc-850 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1.5 text-zinc-400">
                <FileText className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider">File Resource Dropped</span>
              </div>

              <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4 flex items-center gap-4">
                <div className="h-10 w-10 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center text-zinc-200">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-white truncate">{pushedResource.fileName}</h4>
                  <p className="text-[10px] text-zinc-500 truncate">{pushedResource.mimeType}</p>
                </div>
              </div>

              <a
                href={pushedResource.fileUrl}
                download={pushedResource.fileName}
                target="_blank"
                rel="noreferrer"
                onClick={() => setPushedResource(null)}
                className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-sm py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors block text-center"
              >
                <FileDown className="h-4 w-4" />
                <span>Download Resource</span>
              </a>
            </div>
          </div>
        )}

      </main>

      {/* Sticky Bottom Segment: Live Confusion Toggle button */}
      <footer className="w-full max-w-md mx-auto p-4 z-10">
        <button
          onClick={handleToggleConfusion}
          disabled={isSyncingLost}
          className={`w-full py-4 rounded-2xl font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer shadow-xl ${
            isLost 
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20 border border-rose-500 scale-[1.01]' 
              : 'bg-zinc-900 hover:bg-zinc-850 text-rose-500 border border-zinc-800 hover:border-zinc-700'
          } disabled:opacity-50`}
        >
          <HelpCircle className="h-4 w-4" />
          <span>{isLost ? "I'm Lost (Click when resolved)" : "I'm Lost / Explain Again"}</span>
        </button>
      </footer>
    </div>
  );
};
