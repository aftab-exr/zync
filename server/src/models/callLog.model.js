import mongoose, { Schema } from "mongoose";

const callLogSchema = new Schema(
  {
    caller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
    callType: { type: String, enum: ["audio", "video"], required: true },
    duration: { type: Number, default: 0 },
    status: { type: String, enum: ["missed", "answered"], required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("CallLog", callLogSchema);
