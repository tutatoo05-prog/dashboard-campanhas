import type { User } from '@/types'

async function enviar<T>(url: string, metodo: 'PATCH' | 'POST', corpo: unknown): Promise<T> {
  const response = await fetch(url, {
    method: metodo,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(corpo),
  })
  const data = await response.json().catch(() => ({}))
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível salvar agora.')
  return data as T
}

/** Muda o próprio nome e/ou a foto (avatar: '' volta para a inicial; 'sticker:rose' é um adesivo; 'data:image/...' é foto). */
export async function updateProfile(campos: { nome?: string; avatar?: string }): Promise<User> {
  const data = await enviar<{ user: User }>('/api/auth/me', 'PATCH', campos)
  return data.user
}

export function changePassword(atual: string, nova: string): Promise<{ success: true }> {
  return enviar('/api/auth/senha', 'POST', { atual, nova })
}

/** Reduz a foto escolhida para um quadrado de 256 px (JPEG) antes de enviar: fica com ~20 KB. */
export function resizePhoto(arquivo: File, lado = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) {
      reject(new Error('Escolha uma foto PNG, JPG ou WebP.'))
      return
    }
    const url = URL.createObjectURL(arquivo)
    const imagem = new Image()
    imagem.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = lado
      canvas.height = lado
      const contexto = canvas.getContext('2d')
      if (!contexto) {
        URL.revokeObjectURL(url)
        reject(new Error('Seu navegador não conseguiu preparar a foto.'))
        return
      }
      // corta o centro em quadrado, sem esticar
      const menor = Math.min(imagem.width, imagem.height)
      contexto.drawImage(imagem, (imagem.width - menor) / 2, (imagem.height - menor) / 2, menor, menor, 0, 0, lado, lado)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    imagem.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não consegui abrir essa foto.'))
    }
    imagem.src = url
  })
}
