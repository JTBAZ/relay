import EditorBenchClient from './EditorBenchClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export default function EditorBenchPage() { if (process.env.NODE_ENV !== 'development') notFound(); return <EditorBenchClient />; }
