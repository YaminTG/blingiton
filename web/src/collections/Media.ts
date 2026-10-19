import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { ValidationError, type CollectionBeforeChangeHook, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { anyone, may } from '@/access'
import { l } from '@/fields/label'
import { aiField } from '@/fields/seo'
import { refreshAfterChange } from '@/hooks/lifecycle'
import { tags } from '@/lib/tags'

// Below this width a photo looks soft on a product page (cards are shown up to ~800px on retina screens).
export const MIN_GOOD_WIDTH = 800

const webp = (quality: number) => ({ format: 'webp' as const, options: { quality } })

// Refuse an exact copy of a photo that's already in the library, and point to it instead.
const rejectDuplicates: CollectionBeforeValidateHook = async ({ data, req, operation, context }) => {
  const file = req.file
  if (operation !== 'create' || !file || !data) return data
  const bytes = file.data?.length ? file.data : file.tempFilePath ? await readFile(file.tempFilePath) : null
  if (!bytes) return data
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  if (!context.importing) {
    const existing = await req.payload.find({ collection: 'media', where: { sha256: { equals: sha256 } }, limit: 1, depth: 0, req })
    if (existing.docs[0]) {
      throw new ValidationError({
        collection: 'media',
        errors: [
          {
            path: 'file',
            message: `This photo is already in the library as “${existing.docs[0].filename}”. Choose it from the library instead of uploading it again.`,
          },
        ],
      })
    }
  }
  return { ...data, sha256 }
}

const flagLowResolution: CollectionBeforeChangeHook = ({ data }) => {
  if (typeof data.width === 'number') data.lowResolution = data.width < MIN_GOOD_WIDTH
  return data
}

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: l('Photo', 'صورة'), plural: l('Photos', 'الصور') },
  access: {
    read: anyone,
    create: may('catalog'),
    update: may('catalog'),
    delete: may('catalog'),
  },
  admin: {
    useAsTitle: 'filename',
    group: l('Shop', 'المتجر'),
    defaultColumns: ['filename', 'alt', 'width', 'lowResolution', 'updatedAt'],
    description: l(
      'Drag in as many photos as you like. Phone photos are resized and compressed automatically. Click a photo to set its focus point so square crops keep the piece in view.',
      'اسحب أي عدد من الصور. صور الهاتف تُصغّر وتُضغط تلقائياً. اضغط على الصورة لتحديد نقطة التركيز حتى يبقى المنتج ظاهراً في القص المربع.',
    ),
  },
  hooks: {
    beforeValidate: [rejectDuplicates],
    beforeChange: [flagLowResolution],
    // A new photo or description shows on product/category pages straight away.
    afterChange: [refreshAfterChange(tags.products, tags.categories)],
  },
  fields: [
    {
      // Left empty on upload; the SEO pipeline describes the photo in both languages.
      name: 'alt',
      type: 'text',
      label: l('Photo description', 'وصف الصورة'),
      localized: true,
      admin: {
        description: l(
          'Describes the photo for Google and screen readers. Filled in automatically if left empty.',
          'يصف الصورة لجوجل ولقارئات الشاشة. يُكتب تلقائياً إذا تُرك فارغاً.',
        ),
      },
    },
    {
      name: 'lowResolution',
      type: 'checkbox',
      label: l('⚠ Low resolution', '⚠ دقة منخفضة'),
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: l(
          `Narrower than ${MIN_GOOD_WIDTH}px, so it may look blurry on the product page. A bigger photo is better.`,
          `أضيق من ${MIN_GOOD_WIDTH} بكسل وقد تظهر غير واضحة في صفحة المنتج. يفضّل استخدام صورة أكبر.`,
        ),
        condition: (data) => Boolean(data?.lowResolution),
      },
    },
    { name: 'sha256', type: 'text', index: true, admin: { hidden: true } },
    aiField,
    { name: 'wooId', type: 'number', index: true, admin: { hidden: true } },
  ],
  upload: {
    // HEIC (iPhone "High Efficiency") can't be processed here. Safari and most phones send JPEG when
    // uploading through the browser, so in practice this only affects files copied off a Mac.
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    focalPoint: true,
    crop: true,
    // The stored original: at most 2000px on its longest side and WebP, so a 6 MB phone photo
    // becomes a few hundred KB. Payload also auto-rotates using EXIF and strips metadata (incl. GPS).
    resizeOptions: { width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true },
    formatOptions: webp(85),
    // Square crops follow the focal point set in the admin (centre by default).
    imageSizes: [
      { name: 'thumb', width: 400, height: 400, formatOptions: webp(80) },
      { name: 'card', width: 800, height: 800, formatOptions: webp(82) },
      { name: 'large', width: 1600, formatOptions: webp(85) },
    ],
    adminThumbnail: 'thumb',
  },
}
