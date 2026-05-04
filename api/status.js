export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    name: 'Hollywood AI Agent',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
}