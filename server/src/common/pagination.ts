export const DEFAULT_PAGE_SIZE = 20;

/** Chạy findMany + count song song và trả { items, total, page, pageSize } */
export async function paginate<T>(
  {
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  }: { page?: number; pageSize?: number },
  find: (range: { skip: number; take: number }) => Promise<T[]>,
  count: () => Promise<number>,
) {
  const [items, total] = await Promise.all([
    find({ skip: (page - 1) * pageSize, take: pageSize }),
    count(),
  ]);
  return { items, total, page, pageSize };
}
