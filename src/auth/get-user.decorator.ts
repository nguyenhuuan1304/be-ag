import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Define the shape of the user object (adjust based on your JWT payload)
export interface UserPayload {
  id: number;
  fullName: string;
  // Add other fields as needed, e.g., email, username, etc.
}

// Create the GetUser decorator
export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user; // Assumes JwtAuthGuard attaches the user to the request
  },
);
