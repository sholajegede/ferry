import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sweep expired data", { minutes: 30 }, internal.maintenance.sweep);

export default crons;
