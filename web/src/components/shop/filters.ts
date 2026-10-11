import type { PriceBand, SortOrder } from '@/lib/data'

export type Filters = { price?: PriceBand; personal: boolean; sort: SortOrder; page: number }
export type RawParams = { [key: string]: string | string[] | undefined }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export function readFilters(params: RawParams): Filters {
  const price = one(params.price)
  const sort = one(params.sort)
  const page = Number(one(params.page))
  return {
    price: price === 'lt40' || price === '40to60' || price === 'gt60' ? price : undefined,
    personal: one(params.personal) === '1',
    sort: sort === 'low' || sort === 'high' ? sort : 'loved',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** Any filter or sort beyond plain paging: such pages aren't indexed (the unfiltered page is canonical). */
export const isFiltered = (f: Filters) => Boolean(f.price || f.personal || f.sort !== 'loved')

/** URL for a listing with the given filters; page 1 and the default sort are left out. */
export function listingHref(base: string, f: Partial<Filters>) {
  const q = new URLSearchParams()
  if (f.price) q.set('price', f.price)
  if (f.personal) q.set('personal', '1')
  if (f.sort && f.sort !== 'loved') q.set('sort', f.sort)
  if (f.page && f.page > 1) q.set('page', String(f.page))
  const s = q.toString()
  return s ? `${base}?${s}` : base
}
