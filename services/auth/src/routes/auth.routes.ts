import { FastifyInstance } from 'fastify';
import {
  register, login, login2FA, googleLogin, refresh, logout, getMe, updateMe,
  forgotPassword, resetPassword,
  googleCallback, enable2FA, verify2FA, disable2FA, verifyEmail, resendVerificationCode, guestLogin
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export async function authRoutes(fastify: FastifyInstance) {
  const tags = ['Authentication'];

  fastify.post('/login/google', {
    schema: {
      tags, summary: 'Sign in with a Firebase Google ID token',
      body: {
        type: 'object', required: ['idToken'], additionalProperties: false,
        properties: { idToken: { type: 'string', minLength: 1, maxLength: 16384 } },
      },
    },
  }, googleLogin);

  fastify.post('/guest', {
    schema: {
      tags,
      summary: 'Guest Login',
      description: 'Creates a real guest session and returns a signed JWT access token.',
      response: {
        200: {
          type: 'object',
          properties: {
            session_token: { type: 'string' },
            guest_user_id: { type: 'string' },
            expires_at: { type: 'string' }
          }
        }
      }
    }
  }, guestLogin);

  fastify.post('/register', {
    schema: {
      tags,
      summary: 'Register a new user',
      description: 'Creates a new user account with email and password.',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          fullName: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            user: { type: 'object', additionalProperties: true }
          }
        }
      }
    }
  }, register);

  fastify.post('/login', {
    schema: {
      tags,
      summary: 'Login to account',
      description: 'Step 1 of login. Returns tokens, or requires2FA:true with an mfaToken if 2FA is enabled.',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            requires2FA: { type: 'boolean' },
            mfaToken: { type: 'string' },
            message: { type: 'string' },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, login);

  fastify.post('/login/2fa', {
    schema: {
      tags,
      summary: 'Complete 2FA Login',
      description: 'Step 2 of login. Submit the mfaToken and the 6-digit TOTP code.',
      body: {
        type: 'object',
        required: ['mfaToken', 'totpCode'],
        properties: {
          mfaToken: { type: 'string' },
          totpCode: { type: 'string', minLength: 6, maxLength: 6 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, login2FA);

  fastify.post('/refresh', {
    schema: {
      tags,
      summary: 'Refresh access token',
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          refreshToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' }
          }
        }
      }
    }
  }, refresh);

  fastify.post('/logout', {
    preHandler:requireAuth,
    schema: {
      tags,
      summary: 'Logout of account',
      body: {
        type: 'object',

        properties: {
          refreshToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' }
          }
        }
      }
    }
  }, logout);

  fastify.post('/password/forgot', {
    schema: {
      tags,
      summary: 'Request password reset',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, forgotPassword);

  fastify.post('/password/reset', {
    schema: {
      tags,
      summary: 'Reset password',
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, resetPassword);

  fastify.post('/verify-email', {
    schema: {
      tags,
      summary: 'Verify Email with OTP Code',
      description: 'Verifies a user\'s email using the 6-digit OTP code sent to their email. The code expires in 10 minutes.',
      body: {
        type: 'object',
        required: ['email', 'code'],
        properties: {
          email: { type: 'string', format: 'email' },
          code: { type: 'string', minLength: 6, maxLength: 6, description: '6-digit OTP code sent to email' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, verifyEmail);

  fastify.post('/verify-email/resend', {
    schema: {
      tags,
      summary: 'Resend Verification Code',
      description: 'Generates and sends a new 6-digit verification code to the specified email address.',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, resendVerificationCode);

  fastify.get('/me', {
    preHandler: requireAuth,
    schema: {
      tags,
      summary: 'Get current user profile',
      security: [{ BearerAuth: [] }, { UserIdHeader: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                fullName: { type: 'string' },
                avatarUrl: { type: 'string', nullable: true },
                plan: { type: 'string' },
                userClass: { type: 'string' },
                status: { type: 'string' },
                lastLoginAt: { type: 'string', nullable: true },
                authProvider: { type: 'string' },
                timezone: { type: 'string', nullable: true },
                twoFactorEnabled: { type: 'boolean' }
              }
            }
          }
        }
      }
    } as any
  }, getMe);

  fastify.patch('/me', {
    preHandler: requireAuth,
    schema: {
      tags,
      summary: 'Update user profile',
      security: [{ BearerAuth: [] }, { UserIdHeader: [] }],
      body: {
        type: 'object',
        properties: {
          fullName:  { type: 'string' },
          avatarUrl: { type: 'string' },
          timezone:  { type: 'string' },
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id:               { type: 'string' },
                email:            { type: 'string' },
                fullName:         { type: 'string', nullable: true },
                avatarUrl:        { type: 'string', nullable: true },
                plan:             { type: 'string' },
                userClass:        { type: 'string' },
                status:           { type: 'string' },
                authProvider:     { type: 'string' },
                timezone:         { type: 'string', nullable: true },
                twoFactorEnabled: { type: 'boolean' },
              }
            }
          }
        }
      }
    } as any
  }, updateMe);

  fastify.get('/oauth/google/callback', {
    schema: {
      tags,
      summary: 'Google OAuth callback',
      hide: true // Usually hidden from swagger
    } as any
  }, googleCallback);

  fastify.post('/2fa/enable', {
    preHandler: requireAuth,
    schema: {
      tags,
      summary: 'Enable 2FA (Returns QR Code)',
      security: [{ BearerAuth: [] }, { UserIdHeader: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            qrCodeUrl: { type: 'string' },
            qrCode:    { type: 'string' },
            secret:    { type: 'string' }
          }
        }
      }
    } as any
  }, enable2FA);

  fastify.post('/2fa/verify', {
    preHandler: requireAuth,
    schema: {
      tags,
      summary: 'Verify 2FA token',
      security: [{ BearerAuth: [] }, { UserIdHeader: [] }],
      body: {
        type: 'object',
        required: ['totpCode'],
        properties: {
          totpCode: { type: 'string', minLength: 6, maxLength: 6 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' }
          }
        }
      }
    } as any
  }, verify2FA);

  fastify.post('/2fa/disable', {
    preHandler: requireAuth,
    schema: {
      tags,
      summary: 'Disable 2FA',
      security: [{ BearerAuth: [] }, { UserIdHeader: [] }],
      body: {
        type: 'object',
        required: ['totpCode'],
        properties: {
          totpCode: { type: 'string', minLength: 6, maxLength: 6 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' }
          }
        }
      }
    } as any
  }, disable2FA);
}
