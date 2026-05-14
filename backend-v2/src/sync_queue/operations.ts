import { prisma } from '../lib/prisma';

const operations: Record<string, (payload: any, prisma: any) => Promise<any>> = {
  CREATE_EMPLOYEE: async (payload, prisma) => {
    return prisma.employee.upsert({ where: { id: payload.id }, create: payload, update: payload });
  },
  UPDATE_EMPLOYEE: async (payload, prisma) => {
    const { id, ...data } = payload;
    return prisma.employee.update({ where: { id }, data });
  },
  DELETE_EMPLOYEE: async (payload, prisma) => {
    return prisma.employee.delete({ where: { id: payload.id } });
  },

  CREATE_COMPANY: async (payload, prisma) => {
    return prisma.company.upsert({ where: { id: payload.id }, create: payload, update: payload });
  },
  UPDATE_COMPANY: async (payload, prisma) => {
    const { id, ...data } = payload;
    return prisma.company.update({ where: { id }, data });
  },

  CREATE_PAYROLL_RUN: async (payload, prisma) => {
    return prisma.payrollRun.upsert({ where: { id: payload.id }, create: payload, update: payload });
  },
  UPDATE_PAYROLL_RUN: async (payload, prisma) => {
    const { id, ...data } = payload;
    return prisma.payrollRun.update({ where: { id }, data });
  },

  CREATE_PAYSLIP: async (payload, prisma) => {
    return prisma.payslip.upsert({ where: { id: payload.id }, create: payload, update: payload });
  },
  UPDATE_PAYSLIP: async (payload, prisma) => {
    const { id, ...data } = payload;
    return prisma.payslip.update({ where: { id }, data });
  },
};

export async function executeOperation(name: string, payload: any, prismaClient: any): Promise<any> {
  const handler = operations[name];
  if (!handler) {
    throw new Error(`Unknown sync operation: ${name}`);
  }
  return handler(payload, prismaClient);
}

export function isKnownOperation(name: string): boolean {
  return name in operations;
}
