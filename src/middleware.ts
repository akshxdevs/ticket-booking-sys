import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken"
import dotenv from "dotenv";
dotenv.config();

interface AuthRequest extends Request {
    id?: string
}

const JWT_SECRET = process.env.JWT_SECRET as string;

export function authenticateJWT(req:AuthRequest,res:Response,next:NextFunction) {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
        return res.status(401).json({ message: "No token provided" });
    }
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    try {
        const verified = jwt.verify(token, JWT_SECRET) as { id: string };
        req.id = verified.id;
        next();
    } catch (error) {
        res.status(403).json({
            message: "Not authorized"
        });
    }
}