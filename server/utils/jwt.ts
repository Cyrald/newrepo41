import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { env } from '../env';
import { logger } from './logger';

export interface AccessTokenPayload {
  userId: string;
  roles: string[];
  tfid: string;
  v: number;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  userId: string;
  jti: string;
  tfid: string;
  iat: number;
  exp: number;
}

function getPrivateKey(): string {
  return env.JWT_PRIVATE_KEY;
}

function getPublicKey(): string {
  return env.JWT_PUBLIC_KEY;
}

export function generateAccessToken(
  userId: string, 
  roles: string[], 
  tfid: string,
  tokenVersion: number
): string {
  try {
    const token = jwt.sign(
      { userId, roles, tfid, v: tokenVersion },
      getPrivateKey(),
      { 
        algorithm: 'RS256' as const,
        expiresIn: env.JWT_ACCESS_EXPIRE
      } as jwt.SignOptions
    );
    
    logger.debug('Access token generated', { userId, tfid, tokenVersion });
    return token;
  } catch (error) {
    logger.error('Failed to generate access token', { error, userId });
    throw new Error('Token generation failed');
  }
}

export function generateRefreshToken(userId: string, tfid: string): { token: string; jti: string } {
  try {
    const jti = nanoid();
    const token = jwt.sign(
      { userId, jti, tfid },
      getPrivateKey(),
      { 
        algorithm: 'RS256' as const,
        expiresIn: env.JWT_REFRESH_EXPIRE
      } as jwt.SignOptions
    );
    
    logger.debug('Refresh token generated', { userId, tfid, jti });
    return { token, jti };
  } catch (error) {
    logger.error('Failed to generate refresh token', { error, userId });
    throw new Error('Token generation failed');
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, getPublicKey(), {
      algorithms: ['RS256']
    }) as AccessTokenPayload;
    
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('INVALID_TOKEN');
    }
    logger.error('Token verification failed', { error });
    throw new Error('TOKEN_VERIFICATION_FAILED');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, getPublicKey(), {
      algorithms: ['RS256']
    }) as RefreshTokenPayload;
    
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('INVALID_TOKEN');
    }
    logger.error('Refresh token verification failed', { error });
    throw new Error('TOKEN_VERIFICATION_FAILED');
  }
}

export function generateTokenFamily(): string {
  return nanoid();
}
