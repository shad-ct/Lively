import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
    uppercase: true,
  },
  hostToken: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  endedAt: {
    type: Date,
    default: null,
  },
  // Persisted summaries for reporting after session is ended
  confusionHistory: [
    {
      timestamp: { type: Date, default: Date.now },
      lostCount: Number,
      totalCount: Number,
      percentage: Number,
    }
  ],
  pollSummaries: [
    {
      question: String,
      options: [String],
      responses: [
        {
          attendeeName: String,
          optionSelected: String,
          optionIndex: Number,
        }
      ],
      launchedAt: Date,
      endedAt: Date,
    }
  ],
  quizSummary: [
    {
      attendeeName: String,
      score: Number,
      correctAnswersCount: Number,
      rank: Number,
    }
  ]
});


export const Session = mongoose.model('Session', sessionSchema);
