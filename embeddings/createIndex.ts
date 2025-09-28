import { Pinecone } from '@pinecone-database/pinecone'
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.NEXT_PUBLIC_PINECONE_API_KEY) {
  throw new Error('pinecone api key is not set')
}

const pc = new Pinecone({ apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY });

try {
  await pc.createIndexForModel({
    name: 'sage-vector-index',
    cloud: 'aws',
    region: 'us-east-1',
    embed: {
      model: 'llama-text-embed-v2',
      fieldMap: { text: 'chunk_text', chunk_id: 'chunk_id', file_id: 'file_id' },
    },
    waitUntilReady: true,
  });
  console.log('Index created successfully!');
} catch (error) {
  console.error('Error creating index:', error);
}