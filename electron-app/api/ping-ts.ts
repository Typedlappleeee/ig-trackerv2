export default function handler(req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  void req
  res.status(200).json({ ok: true, message: 'pong from typescript', now: new Date().toISOString() })
}
