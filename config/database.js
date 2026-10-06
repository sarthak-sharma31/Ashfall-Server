import mongoose from "mongoose";

// Fail database calls after 5 s instead of 10 s while the database is unreachable,
// so players get an error message quickly instead of waiting.
mongoose.set("bufferTimeoutMS", 5000);

export async function connectDB() {
    if (!process.env.MONGODB_URI) {
        console.warn("⚠️ MONGODB_URI is not set - using a local database. On Railway, add a MongoDB service and set MONGODB_URI.");
    }

    mongoose.connection.on("disconnected", () => console.warn("⚠️ MongoDB disconnected"));
    mongoose.connection.on("reconnected", () => console.log("✅ MongoDB reconnected"));

    try {
        // Set MONGODB_URI on the host (e.g. Railway / MongoDB Atlas); falls back to a local database
        await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://sarthak312005_db_user:AiumBuba@cluster0.wpfdhpu.mongodb.net/?appName=Cluster0", {
        // await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/propocalypse", {
            serverSelectionTimeoutMS: 10000
        });

        console.log("✅ MongoDB Connected");
    }
    catch (err) {
        console.error("❌ MongoDB connection failed:", err.message);
    }
}
