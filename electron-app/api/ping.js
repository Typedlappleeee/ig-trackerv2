module.exports = (req, res) => {
  res.status(200).json({ ok: true, message: 'pong', now: new Date().toISOString() })
}
