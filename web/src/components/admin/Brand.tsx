/* eslint-disable @next/next/no-img-element -- the admin's logo slots expect a plain element */

/** Login page logo. */
export function Logo() {
  return (
    <span className="bl-logo">
      <img src="/logo.png" alt="Blingiton" width={96} height={96} />
      <span>Blingiton</span>
    </span>
  )
}

/** Small mark in the admin's top bar. */
export function Icon() {
  return <img className="bl-icon" src="/logo.png" alt="Blingiton" width={28} height={28} />
}
