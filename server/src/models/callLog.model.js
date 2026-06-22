import mongoose, { Schema } from "mongoose";

const callLogSchema = new Schema(
    {
        caller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        receiver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        callType: {
            type: String,
            enum: ["audio", "video"],
            required: true
        },
        duration: {
            type: Number, // in seconds
            default: 0
        },
        status: {
            type: String,
            enum: ["missed", "answered"],
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

export default mongoose.model("CallLog", callLogSchema);
