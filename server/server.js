import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';

import { Session } from './models/Session.js';
import { Attendee } from './models/Attendee.js';
import { Resource } from './models/Resource.js';
import { QuizData } from './models/QuizData.js';
import firebaseAuthRouter from './routes/firebaseAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Configure CORS to allow frontend connections
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());

// Mount authentication router
app.use('/api/auth', firebaseAuthRouter);

// Create uploads folder if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploads as static resources
app.use('/uploads', express.static(uploadsDir));

// Multer storage engine configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lively';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB successfully.'))
  .catch((err) => console.error('MongoDB connection error:', err));

// --- REST ENDPOINTS ---

// File Upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const { sessionCode } = req.body;
    if (!sessionCode) {
      return res.status(400).json({ error: 'Missing sessionCode' });
    }

    const host = req.headers.host || `localhost:${process.env.PORT || 5000}`;
    const fileUrl = `${req.protocol}://${host}/uploads/${req.file.filename}`;

    const newResource = new Resource({
      sessionCode,
      fileName: req.file.originalname,
      fileUrl,
      mimeType: req.file.mimetype,
    });

    await newResource.save();

    res.json({
      success: true,
      resource: newResource
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// --- IN-MEMORY STATE FOR REAL-TIME TRANSIENT METRICS ---
const activeRooms = {};

// Default quiz questions bootstrapped for every session
const DEFAULT_QUIZ_QUESTIONS = [
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
];

// Helper to generate 6-character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Set up Socket.io server
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Helper to complete a quiz question, tally points, and notify all users
async function endQuizQuestion(code) {
  const room = activeRooms[code];
  if (!room || !room.activeQuiz) return;

  const { questionIndex, correctOptionIndex, options, responses } = room.activeQuiz;

  try {
    // 1. Tally option distribution (e.g. [2, 5, 1, 0])
    const optionDistribution = options.map((_, idx) => {
      return Object.values(responses).filter(r => r.optionIndex === idx).length;
    });

    // 2. Persist cumulative scores to the database for all active attendees
    for (const socketId in room.attendees) {
      const att = room.attendees[socketId];
      await Attendee.findByIdAndUpdate(att.attendeeDbId, {
        score: att.score,
        correctAnswersCount: att.correctAnswersCount,
      });
    }

    // 3. Generate leaderboard
    const leaderboard = Object.values(room.attendees)
      .map(a => ({
        id: a.attendeeDbId.toString(),
        name: a.name,
        score: a.score,
        correctAnswersCount: a.correctAnswersCount
      }))
      .sort((a, b) => b.score - a.score);

    // 4. Update host roster details in real time
    const roster = Object.values(room.attendees).map(a => ({
      id: a.attendeeDbId,
      name: a.name,
      isLost: a.isLost,
      score: a.score,
      correctAnswersCount: a.correctAnswersCount
    }));
    io.to(`host:${code}`).emit('attendee_roster_update', roster);

    // 5. Send results to each attendee socket individually
    for (const socketId in room.attendees) {
      const att = room.attendees[socketId];
      const resp = responses[socketId];

      // Calculate rank
      const rank = leaderboard.findIndex(x => x.id === att.attendeeDbId.toString()) + 1;

      io.to(socketId).emit('quiz_question_ended', {
        isCorrect: resp ? resp.isCorrect : false,
        scoreAdded: resp ? resp.points : 0,
        totalScore: att.score,
        correctOptionIndex,
        rank,
      });
    }

    // 6. Broadcast option distribution & leaderboard to host
    io.to(`host:${code}`).emit('quiz_leaderboard_update', {
      questionIndex,
      optionDistribution,
      leaderboard: leaderboard.slice(0, 5) // top 5 leaderboard
    });

    // Clear activeQuiz in-memory state
    room.activeQuiz = null;

    console.log(`Quiz question [${questionIndex}] completed in room [${code}].`);
  } catch (error) {
    console.error('Error in endQuizQuestion:', error);
  }
}

// Confusion Meter Push Loop (updates hosts every 500ms)
setInterval(() => {
  for (const code in activeRooms) {
    const room = activeRooms[code];
    const totalCount = Object.keys(room.attendees).length;
    const lostCount = Object.values(room.attendees).filter(a => a.isLost).length;
    const percentage = totalCount > 0 ? Math.round((lostCount / totalCount) * 100) : 0;

    // Save transient metric point
    const metricPoint = {
      timestamp: new Date(),
      lostCount,
      totalCount,
      percentage
    };
    room.confusionHistory.push(metricPoint);

    // Keep history length reasonable
    if (room.confusionHistory.length > 200) {
      room.confusionHistory.shift();
    }

    // Push confusion update to the host
    io.to(`host:${code}`).emit('confusion_update', {
      lostCount,
      totalCount,
      percentage,
      history: room.confusionHistory
    });
  }
}, 500);

// WebSocket Operations
io.on('connection', (socket) => {
  let userContext = {
    role: null, // 'host' or 'attendee'
    roomCode: null,
    name: null,
    attendeeId: null,
  };

  // 1. Host creates room
  socket.on('create_room', async (callback) => {
    try {
      let code = generateRoomCode();
      // Ensure unique code
      while (activeRooms[code] || await Session.findOne({ code, isActive: true })) {
        code = generateRoomCode();
      }

      const hostToken = crypto.randomBytes(16).toString('hex');

      const dbSession = new Session({
        code,
        hostToken,
        isActive: true,
      });
      await dbSession.save();

      // Register active room in-memory
      activeRooms[code] = {
        sessionDbId: dbSession._id,
        isFrozen: false,
        confusionHistory: [],
        activePoll: null,
        attendees: {}, // socketId -> attendee properties
        quizQuestions: DEFAULT_QUIZ_QUESTIONS,
        activeQuiz: null,
      };

      // Persist the default quiz questions to database QuizData
      const dbQuiz = new QuizData({
        sessionCode: code,
        questions: activeRooms[code].quizQuestions
      });
      await dbQuiz.save();

      userContext.role = 'host';
      userContext.roomCode = code;

      socket.join(`room:${code}`);
      socket.join(`host:${code}`);

      console.log(`Room [${code}] created by host.`);
      callback({ success: true, code, hostToken });
    } catch (error) {
      console.error('Error in create_room:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 2. Attendee joins room
  socket.on('join_room', async ({ code, name }, callback) => {
    try {
      const roomCode = code.toUpperCase();
      const room = activeRooms[roomCode];

      if (!room) {
        return callback({ success: false, error: 'Room does not exist or has expired.' });
      }

      if (room.isFrozen) {
        return callback({ success: false, error: 'Room is currently frozen. Cannot join.' });
      }

      // Check if session exists in DB
      const dbSession = await Session.findOne({ code: roomCode, isActive: true });
      if (!dbSession) {
        return callback({ success: false, error: 'Session not found in DB.' });
      }

      // Create attendee in database
      const dbAttendee = new Attendee({
        sessionCode: roomCode,
        name,
        status: 'active',
      });
      await dbAttendee.save();

      // Add to in-memory active list
      room.attendees[socket.id] = {
        attendeeDbId: dbAttendee._id,
        name,
        isLost: false,
        score: 0,
        correctAnswersCount: 0,
      };

      userContext.role = 'attendee';
      userContext.roomCode = roomCode;
      userContext.name = name;
      userContext.attendeeId = dbAttendee._id;

      socket.join(`room:${roomCode}`);

      // Notify host of updated attendee roster
      const roster = Object.values(room.attendees).map(a => ({
        id: a.attendeeDbId,
        name: a.name,
        isLost: a.isLost,
        score: a.score,
        correctAnswersCount: a.correctAnswersCount
      }));

      io.to(`host:${roomCode}`).emit('attendee_roster_update', roster);

      // Return current state to new attendee
      callback({
        success: true,
        attendeeId: dbAttendee._id,
        isFrozen: room.isFrozen,
        activePoll: room.activePoll ? {
          question: room.activePoll.question,
          options: room.activePoll.options,
        } : null,
        activeQuiz: room.activeQuiz ? {
          questionIndex: room.activeQuiz.questionIndex,
          questionText: room.activeQuiz.questionText,
          options: room.activeQuiz.options,
          timeLimit: room.activeQuiz.timeLimit,
          timeLeft: room.activeQuiz.timeLeft,
          hasVoted: !!room.activeQuiz.responses[socket.id],
        } : null,
        quizQuestionsCount: room.quizQuestions.length,
      });

      console.log(`Attendee [${name}] joined room [${roomCode}].`);
    } catch (error) {
      console.error('Error in join_room:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 3. Host Broadcasts Code/Text Snippet
  socket.on('broadcast_snippet', (rawText) => {
    if (userContext.role !== 'host') return;
    const code = userContext.roomCode;
    io.to(`room:${code}`).emit('receive_snippet', rawText);
    console.log(`Room [${code}] host broadcasted code snippet.`);
  });

  // 4. Host Pushes Resource
  socket.on('push_resource', (resourceData) => {
    if (userContext.role !== 'host') return;
    const code = userContext.roomCode;
    // resourceData is: { fileName, fileUrl, mimeType }
    io.to(`room:${code}`).emit('receive_resource', resourceData);
    console.log(`Room [${code}] host pushed file asset: ${resourceData.fileName}`);
  });

  // 5. Host screen freeze toggle
  socket.on('toggle_room_freeze', async (callback) => {
    if (userContext.role !== 'host') return;
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room) return callback({ success: false });

    room.isFrozen = !room.isFrozen;

    // Persist freeze status
    io.to(`room:${code}`).emit('room_freeze_status', room.isFrozen);

    console.log(`Room [${code}] freeze toggled to: ${room.isFrozen}`);
    callback({ success: true, isFrozen: room.isFrozen });
  });

  // 6. Host launches live poll
  socket.on('launch_poll', ({ question, options }, callback) => {
    if (userContext.role !== 'host') return;
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room) return callback({ success: false });

    room.activePoll = {
      question,
      options,
      launchedAt: new Date(),
      responses: {}, // socketId -> { name, optionIndex }
    };

    io.to(`room:${code}`).emit('poll_launched', { question, options });
    console.log(`Room [${code}] live poll launched: ${question}`);
    callback({ success: true });
  });

  // 7. Attendee votes in poll
  socket.on('submit_poll_vote', (optionIndex) => {
    if (userContext.role !== 'attendee') return;
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room || !room.activePoll) return;

    room.activePoll.responses[socket.id] = {
      name: userContext.name,
      optionIndex: optionIndex,
    };

    // Calculate aggregated results dynamically
    const results = room.activePoll.options.map((option, idx) => {
      const votes = Object.values(room.activePoll.responses).filter(r => r.optionIndex === idx).length;
      return { option, votes };
    });

    // Stream results back to host
    io.to(`host:${code}`).emit('poll_results_update', results);
  });

  // 8. Host ends poll and saves summary
  socket.on('end_poll', async (callback) => {
    if (userContext.role !== 'host') return;
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room || !room.activePoll) return callback({ success: false });

    try {
      const { question, options, launchedAt, responses } = room.activePoll;
      const responseList = Object.values(responses).map(r => ({
        attendeeName: r.name,
        optionSelected: options[r.optionIndex],
        optionIndex: r.optionIndex
      }));

      // Persist poll summary to the session document in MongoDB
      await Session.findByIdAndUpdate(room.sessionDbId, {
        $push: {
          pollSummaries: {
            question,
            options,
            responses: responseList,
            launchedAt,
            endedAt: new Date(),
          }
        }
      });

      room.activePoll = null;

      io.to(`room:${code}`).emit('poll_ended');
      console.log(`Room [${code}] live poll closed.`);
      callback({ success: true });
    } catch (error) {
      console.error('Error ending poll:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 9. Attendee updates understanding status ("I'm Lost" vs "Tracking Fine")
  socket.on('update_understanding_status', (isLost) => {
    if (userContext.role !== 'attendee') return;
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room || !room.attendees[socket.id]) return;

    room.attendees[socket.id].isLost = isLost;

    // Send instant update to host roster
    const roster = Object.values(room.attendees).map(a => ({
      id: a.attendeeDbId,
      name: a.name,
      isLost: a.isLost,
      score: a.score,
      correctAnswersCount: a.correctAnswersCount
    }));
    io.to(`host:${code}`).emit('attendee_roster_update', roster);
  });

  // Host adds a custom quiz question
  socket.on('add_quiz_question', async ({ questionText, options, correctOptionIndex, timeLimit }, callback) => {
    if (userContext.role !== 'host') return callback({ success: false, error: 'Unauthorized.' });
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room) return callback({ success: false, error: 'Session not active.' });

    const newQuestion = {
      questionText,
      options,
      correctOptionIndex: Number(correctOptionIndex),
      timeLimit: Number(timeLimit || 15)
    };

    try {
      // Add in-memory
      room.quizQuestions.push(newQuestion);

      // Persist to Mongoose db QuizData
      await QuizData.findOneAndUpdate(
        { sessionCode: code },
        { $push: { questions: newQuestion } }
      );

      console.log(`Host added custom question to Room [${code}].`);
      callback({ success: true, question: newQuestion });
    } catch (err) {
      console.error('Error adding custom quiz question:', err);
      callback({ success: false, error: err.message });
    }
  });

  // Host fetches all active quiz questions
  socket.on('get_quiz_questions', (callback) => {
    if (userContext.role !== 'host') return callback({ success: false, error: 'Unauthorized.' });
    const code = userContext.roomCode;
    const room = activeRooms[code];
    if (!room) return callback({ success: false, error: 'No active room.' });
    callback({ success: true, questions: room.quizQuestions });
  });

  // --- LIVE QUIZ GAME LOOP MECHANICS ---

  // Host launches a quiz question
  socket.on('launch_quiz_question', ({ questionIndex }, callback) => {
    if (userContext.role !== 'host') return;
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room || !room.quizQuestions[questionIndex]) {
      return callback({ success: false, error: 'Invalid room or question index.' });
    }

    // Clear previous quiz loop if any
    if (room.activeQuiz && room.activeQuiz.timer) {
      clearInterval(room.activeQuiz.timer);
    }

    const question = room.quizQuestions[questionIndex];

    room.activeQuiz = {
      questionIndex,
      questionText: question.questionText,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
      timeLimit: question.timeLimit,
      timeLeft: question.timeLimit,
      startedAt: new Date(),
      responses: {}, // socketId -> { name, optionIndex, isCorrect, points }
      timer: null
    };

    // Broadcast to room that quiz has started
    io.to(`room:${code}`).emit('quiz_question_launched', {
      questionIndex,
      questionText: question.questionText,
      options: question.options,
      timeLimit: question.timeLimit
    });

    // Start 1-second countdown interval
    room.activeQuiz.timer = setInterval(() => {
      const active = activeRooms[code]?.activeQuiz;
      if (!active) return;

      active.timeLeft -= 1;

      // Broadcast remaining time to all participants
      io.to(`room:${code}`).emit('quiz_tick', { timeLeft: active.timeLeft });

      if (active.timeLeft <= 0) {
        clearInterval(active.timer);
        // Automatically close the question and tally points
        endQuizQuestion(code);
      }
    }, 1000);

    console.log(`Quiz question [${questionIndex}] launched in Room [${code}].`);
    callback({ success: true });
  });

  // Attendee submits an answer
  socket.on('submit_quiz_answer', ({ optionIndex }) => {
    if (userContext.role !== 'attendee') return;
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room || !room.activeQuiz) return;

    // Check if player has already submitted an answer for this question
    if (room.activeQuiz.responses[socket.id]) return;

    const timeElapsed = (Date.now() - room.activeQuiz.startedAt) / 1000;
    const isCorrect = optionIndex === room.activeQuiz.correctOptionIndex;

    // Speed based scoring: max 1000 points, linearly decreases down to 500 based on speed.
    // Minimum points for correct answer is 500. Incorrect answer gets 0 points.
    let points = 0;
    if (isCorrect) {
      const timeRatio = Math.min(1, timeElapsed / room.activeQuiz.timeLimit);
      points = Math.round(1000 * (1 - timeRatio * 0.5));
      points = Math.max(500, points);
    }

    // Save response in activeQuiz state
    room.activeQuiz.responses[socket.id] = {
      name: userContext.name,
      optionIndex,
      isCorrect,
      points,
    };

    // Update attendee cumulative scores in active room roster
    const attendee = room.attendees[socket.id];
    if (attendee) {
      attendee.score += points;
      if (isCorrect) {
        attendee.correctAnswersCount += 1;
      }
    }

    // Notify host that another response came in
    const totalConnectedAttendees = Object.keys(room.attendees).length;
    const submittedCount = Object.keys(room.activeQuiz.responses).length;

    io.to(`host:${code}`).emit('attendee_quiz_answered', {
      submittedCount,
      totalCount: totalConnectedAttendees
    });
  });

  // Host ends quiz question manually
  socket.on('end_quiz_question', (callback) => {
    if (userContext.role !== 'host') return;
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room || !room.activeQuiz) {
      return callback({ success: false, error: 'No active quiz question.' });
    }

    if (room.activeQuiz.timer) {
      clearInterval(room.activeQuiz.timer);
    }

    endQuizQuestion(code);
    callback({ success: true });
  });

  // Host buzzes selected users
  socket.on('buzz_users', ({ attendeeIds, buzzAll }) => {
    if (userContext.role !== 'host') return;
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room) return;

    if (buzzAll) {
      // Buzz everyone in the room (excluding host)
      socket.to(`room:${code}`).emit('receive_buzz');
      console.log(`Host buzzed ALL users in room [${code}].`);
    } else if (Array.isArray(attendeeIds)) {
      // Find matching socket IDs and buzz them
      for (const socketId in room.attendees) {
        const attendee = room.attendees[socketId];
        if (attendeeIds.includes(attendee.attendeeDbId.toString())) {
          io.to(socketId).emit('receive_buzz');
        }
      }
      console.log(`Host buzzed targeted users in room [${code}].`);
    }
  });

  // 10. Host ends session
  socket.on('end_session', async (callback) => {
    if (userContext.role !== 'host') return;
    const code = userContext.roomCode;
    const room = activeRooms[code];

    if (!room) return callback({ success: false });

    try {
      // Tally final quiz leaderboard
      const leaderboard = Object.values(room.attendees)
        .map(a => ({
          attendeeName: a.name,
          score: a.score,
          correctAnswersCount: a.correctAnswersCount,
        }))
        .sort((a, b) => b.score - a.score)
        .map((item, idx) => ({ ...item, rank: idx + 1 }));

      // Save final stats & leaderboard to DB
      await Session.findByIdAndUpdate(room.sessionDbId, {
        isActive: false,
        endedAt: new Date(),
        confusionHistory: room.confusionHistory,
        quizSummary: leaderboard
      });

      // Update all active attendees leftTime & status in DB
      const attendeeIds = Object.values(room.attendees).map(a => a.attendeeDbId);
      await Attendee.updateMany(
        { _id: { $in: attendeeIds } },
        { status: 'inactive', leftAt: new Date() }
      );

      // Notify and clean up sockets
      io.to(`room:${code}`).emit('session_ended');

      delete activeRooms[code];
      console.log(`Session [${code}] closed and persisted with quiz summary.`);
      callback({ success: true });
    } catch (error) {
      console.error('Error closing session:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Handle Disconnections
  socket.on('disconnect', async () => {
    const code = userContext.roomCode;
    if (!code || !activeRooms[code]) return;

    if (userContext.role === 'attendee') {
      const room = activeRooms[code];
      const attendeeData = room.attendees[socket.id];

      if (attendeeData) {
        // Update DB attendee status
        await Attendee.findByIdAndUpdate(attendeeData.attendeeDbId, {
          status: 'inactive',
          leftAt: new Date()
        });

        // Remove from in-memory room
        delete room.attendees[socket.id];

        // Notify host
        const roster = Object.values(room.attendees).map(a => ({
          id: a.attendeeDbId,
          name: a.name,
          isLost: a.isLost,
          score: a.score,
          correctAnswersCount: a.correctAnswersCount
        }));
        io.to(`host:${code}`).emit('attendee_roster_update', roster);

        console.log(`Attendee [${userContext.name}] disconnected from room [${code}].`);
      }
    } else if (userContext.role === 'host') {
      console.log(`Host disconnected from room [${code}]. Reconnection window open.`);
      // We keep room in memory for a short duration so host can reconnect.
      // If host doesn't reconnect in 60s, we can auto-terminate.
      setTimeout(async () => {
        const checkRoom = activeRooms[code];
        if (checkRoom) {
          // If no host socket is in the room:
          const clients = await io.in(`host:${code}`).fetchSockets();
          if (clients.length === 0) {
            console.log(`Terminating idle session [${code}] after host timeout.`);
            // Clean up DB
            await Session.findByIdAndUpdate(checkRoom.sessionDbId, {
              isActive: false,
              endedAt: new Date(),
              confusionHistory: checkRoom.confusionHistory
            });
            const attendeeIds = Object.values(checkRoom.attendees).map(a => a.attendeeDbId);
            await Attendee.updateMany(
              { _id: { $in: attendeeIds } },
              { status: 'inactive', leftAt: new Date() }
            );
            io.to(`room:${code}`).emit('session_ended');
            delete activeRooms[code];
          }
        }
      }, 60000);
    }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Realtime Presenter engine running on port ${PORT}`);
});
