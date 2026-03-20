import express from "express";
import Redis from "ioredis";
import { prismaClient } from "../lib/db";
import { z } from "zod";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { authenticateJWT } from "../middleware";
dotenv.config();
const TICKET_SECRET = process.env.TICKET_SECRET as string
export const ticketRouter = express.Router();
const redisClient = new Redis()

const lockSeatSchema = z.object({
    eventId: z.string().uuid(),
    seatNumber: z.string().min(1)
});

const confirmBookingSchema = z.object({
    eventId: z.string().uuid(),
    seatNumber: z.string().min(1),
    venue: z.enum(["VIP","REGULAR","BALCONY"])
});

async function lockSeat(eventId:string,seatNumber:string,userId:string) {

    const event = await prismaClient.event.findUnique({
        where: { id: eventId },
        select: { availableTickets: true }
    });
    if (!event) {
        return { success: false, message: "Event not found." };
    }
    if (event.availableTickets <= 0) {
        return { success: false, message: "No tickets available for this event." };
    }

    const checkSeatAvailablity = await prismaClient.seat.findFirst({
        where:{
            seatNumber:seatNumber,
            eventId:eventId
        }
    })
    if (checkSeatAvailablity) {
        return {success:false,message:"Seat already reserved!"}
    }else{
        const lockey = `event:${eventId}:seat:${seatNumber}`;
        const existingLock = await redisClient.get(lockey);
        if (existingLock) {
            return {success:false,message:"Seat already locked by another user"}
        }
        await redisClient.set(lockey,userId,"EX",300);
        return {success:true,message:"Seat locked successfully, complete booking within 5 min"}
    }
}
async function confirmBooking(eventId: string, seatNumber: string, userId: string, venue: "VIP" | "REGULAR" | "BALCONY") {
    const lockKey = `event:${eventId}:seat:${seatNumber}`;

    const lockedBy = await redisClient.get(lockKey);
    if (!lockedBy) {
        return { success: false, message: "No active lock found. Please lock the seat first." };
    }
    if (lockedBy !== userId) {
        return { success: false, message: "Seat is locked by another user." };
    }

    const event = await prismaClient.event.findUnique({
        where: { id: eventId },
        select: { availableTickets: true }
    });
    if (!event || event.availableTickets <= 0) {
        await redisClient.del(lockKey);
        return { success: false, message: "No tickets available for this event." };
    }

    try {
        const ticket = await prismaClient.ticket.create({
            data:{
                userId:userId,
                eventId:eventId,
                price:100,
                seatNumber:seatNumber
            }
        })
        const ticketToken = jwt.sign({
            ticketToken:ticket.id
        },TICKET_SECRET)
        await prismaClient.seat.create({
            data: {
                eventId: eventId,
                userId: userId,
                seatNumber: seatNumber,
                venue: venue,
                ticketId:ticket.id
            }
        });
        await prismaClient.event.update({
            where: { id: eventId },
            data: { availableTickets: { decrement: 1 }}

        })
        await redisClient.del(lockKey);
        return { success: true, ticketToken, message: "Booking confirmed!" };
    } catch (error) {
        console.error("Error in confirming booking:", error);
        return { success: false, message: "An error occurred while confirming the booking." };
    }

}

ticketRouter.post("/lockseat",authenticateJWT,async (req: any, res) => {
    const parsed = lockSeatSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid Input", error: parsed.error.errors });
    }
    const { eventId, seatNumber } = parsed.data;
    const userId = req.id as string;
    const result = await lockSeat(eventId, seatNumber, userId);
    res.json(result);
});

ticketRouter.post("/confirmbooking",authenticateJWT, async (req: any, res) => {
    const parsed = confirmBookingSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid Input", error: parsed.error.errors });
    }
    const { eventId, seatNumber, venue } = parsed.data;
    const userId = req.id as string;
    const result = await confirmBooking(eventId, seatNumber, userId, venue);
    res.json(result);
});

ticketRouter.get("/mytickets", authenticateJWT, async (req: any, res) => {
    try {
        const userId = req.id as string;
        const tickets = await prismaClient.ticket.findMany({
            where: { userId, status: "BOOKED" },
            include: {
                event: {
                    select: { eventName: true, eventDetail: true }
                }
            },
            orderBy: { id: "desc" }
        });
        res.json({ success: true, tickets });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong!" });
    }
});

const cancelTicketSchema = z.object({
    ticketId: z.string().uuid()
});

ticketRouter.post("/cancel", authenticateJWT, async (req: any, res) => {
    const parsed = cancelTicketSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid Input", error: parsed.error.errors });
    }
    const { ticketId } = parsed.data;
    const userId = req.id as string;

    try {
        const ticket = await prismaClient.ticket.findUnique({
            where: { id: ticketId }
        });
        if (!ticket) {
            return res.status(404).json({ success: false, message: "Ticket not found." });
        }
        if (ticket.userId !== userId) {
            return res.status(403).json({ success: false, message: "You can only cancel your own tickets." });
        }
        if (ticket.status === "CANCELLED") {
            return res.status(400).json({ success: false, message: "Ticket is already cancelled." });
        }

        await prismaClient.$transaction([
            prismaClient.ticket.update({
                where: { id: ticketId },
                data: { status: "CANCELLED" }
            }),
            prismaClient.seat.deleteMany({
                where: { ticketId: ticketId }
            }),
            prismaClient.event.update({
                where: { id: ticket.eventId },
                data: { availableTickets: { increment: 1 } }
            })
        ]);

        res.json({ success: true, message: "Ticket cancelled successfully." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong!" });
    }
});

