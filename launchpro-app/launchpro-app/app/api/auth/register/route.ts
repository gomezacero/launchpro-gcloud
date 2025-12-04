import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, invitationCode } = await request.json();

    // Validate required fields
    if (!email || !password || !name || !invitationCode) {
      return NextResponse.json(
        { success: false, error: 'Todos los campos son requeridos' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Email inválido' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      );
    }

    // Validate invitation code
    const code = await prisma.invitationCode.findUnique({
      where: { code: invitationCode },
    });

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Código de invitación inválido' },
        { status: 400 }
      );
    }

    if (code.used) {
      return NextResponse.json(
        { success: false, error: 'Este código de invitación ya fue utilizado' },
        { status: 400 }
      );
    }

    if (code.expiresAt && new Date() > code.expiresAt) {
      return NextResponse.json(
        { success: false, error: 'Este código de invitación ha expirado' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingManager = await prisma.manager.findUnique({
      where: { email },
    });

    if (existingManager) {
      return NextResponse.json(
        { success: false, error: 'Este email ya está registrado' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create manager
    const manager = await prisma.manager.create({
      data: {
        email,
        passwordHash,
        name,
      },
    });

    // Mark invitation code as used
    await prisma.invitationCode.update({
      where: { id: code.id },
      data: {
        used: true,
        usedBy: manager.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Cuenta creada exitosamente',
      managerId: manager.id,
    });
  } catch (error: any) {
    console.error('Error registering manager:', error);
    return NextResponse.json(
      { success: false, error: 'Error al crear la cuenta' },
      { status: 500 }
    );
  }
}
