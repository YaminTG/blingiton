import type { DefaultServerCellComponentProps } from 'payload'

import { availabilityOptions, restockOptions } from '@/lib/productOptions'
import type { Product } from '@/payload-types'

const langOf = (i18n: DefaultServerCellComponentProps['i18n']) => (i18n.language === 'ar' ? 'ar' : 'en')

/** Availability as a pill, with the number of pieces next to "In stock". */
export function AvailabilityCell({ cellData, rowData, i18n }: DefaultServerCellComponentProps) {
  const lang = langOf(i18n)
  const value = cellData as Product['availability'] | undefined
  const option = availabilityOptions.find((o) => o.value === value)
  const stock = (rowData as Partial<Product>).stock
  return (
    <span className={`bl-status bl-avail--${value ?? 'none'}`}>
      {option ? option.label[lang] : '–'}
      {value === 'in_stock' && typeof stock === 'number' ? <span className="bl-avail__count">{stock}</span> : null}
    </span>
  )
}

export function RestockCell({ cellData, i18n }: DefaultServerCellComponentProps) {
  const option = restockOptions.find((o) => o.value === cellData)
  return <span className={`bl-restock bl-restock--${option?.value ?? 'none'}`}>{option ? option.label[langOf(i18n)] : '–'}</span>
}
