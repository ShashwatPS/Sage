import { Pinecone } from '@pinecone-database/pinecone'
import dotenv from 'dotenv'

dotenv.config()

if (!process.env.PINECONE_API_KEY) {
  throw new Error('PINECONE_API_KEY is not set')
}

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

try {
  await pc.createIndexForModel({
    name: 'sage-index',
    cloud: 'aws',
    region: 'us-east-1',
    embed: {
      model: 'llama-text-embed-v2',
      fieldMap: { text: 'chunk_text', chunk_id: 'chunk_id' },
    },
    waitUntilReady: true,
  });
  console.log('Index created successfully!');
} catch (error) {
  console.error('Error creating index:', error);
}