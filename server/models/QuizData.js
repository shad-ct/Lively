import mongoose from 'mongoose';

const quizQuestionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: true,
  },
  options: {
    type: [String],
    required: true,
    validate: [arr => arr.length >= 2 && arr.length <= 5, 'Options count must be between 2 and 5'],
  },
  correctOptionIndex: {
    type: Number,
    required: true,
  },
  timeLimit: {
    type: Number,
    default: 15, // standard 15-second countdown
  }
});

const quizDataSchema = new mongoose.Schema({
  sessionCode: {
    type: String,
    required: true,
    index: true,
    uppercase: true,
  },
  questions: [quizQuestionSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

export const QuizData = mongoose.model('QuizData', quizDataSchema);
export const QuizQuestion = mongoose.model('QuizQuestion', quizQuestionSchema);
