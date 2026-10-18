export const statusOf = (error: any): number =>
  Number(error?.status ?? error?.response?.status ?? error?.code);

// Tài nguyên không còn trên Google (404/410), vd sự kiện hoặc email đã bị xóa
export const isGone = (error: unknown) => [404, 410].includes(statusOf(error));
