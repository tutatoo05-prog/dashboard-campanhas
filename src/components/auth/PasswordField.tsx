import { useState } from 'react'

export const PASSWORD_CRITERIA = [
  { label: 'Pelo menos 8 caracteres', test: (value: string) => value.length >= 8 },
  { label: 'Uma letra maiúscula', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'Uma letra minúscula', test: (value: string) => /[a-z]/.test(value) },
  { label: 'Um número', test: (value: string) => /[0-9]/.test(value) },
  { label: 'Um caractere especial', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
]

export function isPasswordValid(value: string) {
  return PASSWORD_CRITERIA.every((criterion) => criterion.test(value))
}

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
      {PASSWORD_CRITERIA.map((criterion) => {
        const met = criterion.test(value)
        return (
          <li
            key={criterion.label}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              met ? 'text-green-400' : 'text-red-400/80'
            }`}
          >
            <i className={`fa-solid ${met ? 'fa-circle-check' : 'fa-circle-xmark'} text-[11px]`} />
            {criterion.label}
          </li>
        )
      })}
    </ul>
  )
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  showChecklist,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  showChecklist?: boolean
}) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-500">{label}</span>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          data-lpignore="true"
          required
          minLength={8}
          className="auth-input filter-input pr-10"
          placeholder="••••••••"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-500 transition hover:text-zinc-300"
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          tabIndex={-1}
          onClick={() => setVisible((prev) => !prev)}
        >
          <i className={`fa-regular ${visible ? 'fa-eye-slash' : 'fa-eye'} text-sm`} />
        </button>
      </div>
      {showChecklist && <PasswordChecklist value={value} />}
    </label>
  )
}
