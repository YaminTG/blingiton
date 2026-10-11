import type { DefaultServerCellComponentProps } from 'payload'

import { scoreBand } from '@/seo/score'

/** The SEO score column in the products list: the number plus a small bar in green / amber / red. */
export function SeoScoreCell({ cellData }: DefaultServerCellComponentProps) {
  const score = typeof cellData === 'number' ? cellData : null
  return <ScoreBadge score={score} />
}

export function ScoreBadge({ score }: { score: number | null }) {
  return (
    <span className={`bl-score bl-score--${scoreBand(score)}`} title={score == null ? undefined : `${score} / 100`}>
      <span className="bl-score__num">{score ?? '–'}</span>
      <span className="bl-score__bar" aria-hidden>
        <span style={{ width: `${score ?? 0}%` }} />
      </span>
    </span>
  )
}
