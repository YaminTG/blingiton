'use client'
/* eslint-disable @next/next/no-img-element -- admin thumbnails come from the media API as-is */

import type { DefaultCellComponentProps } from 'payload'

import { useListRelationships } from '@payloadcms/ui'
import { useEffect } from 'react'

type MediaDoc = { url?: string | null; thumbnailURL?: string | null; sizes?: { thumb?: { url?: string | null } } }

/**
 * The first photo as a small square in the products list. Uses the list's shared loader, so all
 * rows' photos are fetched in one request.
 */
export function PhotoCell({ cellData }: DefaultCellComponentProps) {
  const first = Array.isArray(cellData) ? cellData[0] : cellData
  const id = first && typeof first === 'object' ? (first as { id: number }).id : (first as number | undefined)
  const { documents, getRelationships } = useListRelationships()

  useEffect(() => {
    if (id != null) getRelationships([{ relationTo: 'media', value: id }])
  }, [id, getRelationships])

  const doc = id != null ? (documents.media?.[id] as MediaDoc | false | null | undefined) : null
  const src = doc ? (doc.sizes?.thumb?.url ?? doc.thumbnailURL ?? doc.url) : null
  return <span className="bl-thumb">{src ? <img src={src} alt="" loading="lazy" /> : null}</span>
}
