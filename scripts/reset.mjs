const response = await fetch('http://127.0.0.1:3402/api/benchmark/reset', { method: 'POST', headers: { 'x-benchmark-key': process.env.BENCHMARK_RESET_KEY || 'local-demo-reset' } });
if (!response.ok) throw new Error(`Reset failed (${response.status})`);
console.log(await response.json());
