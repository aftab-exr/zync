import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['dm', 'group'], default: 'dm' },
  
  dmParticipants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  lastMessageAt: { type: Date, default: Date.now },
  lastMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

conversationSchema.index({ dmParticipants: 1 });
conversationSchema.index({ lastMessageAt: -1 }); 

export default mongoose.model('Conversation', conversationSchema);