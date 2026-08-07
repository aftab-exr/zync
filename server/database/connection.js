import mongoose from "mongoose";

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
    } catch (error) {
        console.error(`MONGODB Connection Error: ${error.message}`);
        process.exit(1);
    }
}

export { connectDB };