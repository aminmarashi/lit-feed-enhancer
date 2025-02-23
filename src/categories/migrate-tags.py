import os
from pymongo import MongoClient, UpdateOne, UpdateMany
from sentence_transformers import SentenceTransformer, util
import torch

# Load environment variable for MongoDB URL
mongo_url = os.environ.get("MONG_URL")
mongo_url = 'FAKE_MONGODB_URI'
if not mongo_url:
    raise EnvironmentError("MONG_URL environment variable is not set.")

# Connect to MongoDB and select the database and collection
client = MongoClient(mongo_url)
backend_db = client['feed-backend']
backend_articles_collection = backend_db.articles
db = client.feed
articles_collection = db.articles

# Load a pre-trained Sentence Transformer model
model = SentenceTransformer('all-mpnet-base-v2')

categories = [
  "APIs",
  "Mobile",
  "Apps",
  "Health",
  "Politics",
  "Sports",
  "Energy",
  "Business",
  "Engineering",
  "Design",
  "Artificial Intelligence",
  "Asia",
  "Europe",
  "Africa",
  "Americas",
  "Oceania",
  "China",
  "India",
  "Russia",
  "Ukraine",
  "Middle East",
  "North America",
  "Emergency",
  "Life Story",
  "Tech Billionaires",
  "Celebrities",
  "Layoffs",
  "Mergers",
  "Acquisitions",
  "Venture Capital",
  "Coding",
  "Religion",
  "Culture",
  "Open Source",
  "DevTools",
  "Operating Systems",
  "Terminal",
  "Testing",
  "Video",
  "Cloud",
  "Analytics",
  "Graphics",
  "Gaming",
  "User Interface",
  "User Experience",
  "Guides",
  "Writing",
  "Generative AI",
  "Scandal",
  "Crypto",
  "Stocks",
  "Trading",
  "Libraries",
  "Networking",
  "Interfaces",
  "FOSS",
  "Consumer",
  "Performance",
  "Power",
  "Security",
  "Emerging",
  "Concurrency",
  "Bandwidth",
  "Communication",
  "Vision",
  "Modeling",
  "Brands",
  "Messaging",
  "Remote",
  "Media",
  "Containers",
  "Artificial General Intelligence",
  "Large Language Models",
  "AB Testing",
  "Chips",
  "DataScience",
  "Accelerators",
  "Marketing",
  "Personal",
  "Architecture",
  "Education",
  "Software",
  "Accessibility",
  "Chemistry",
  "Protocols",
  "Industry",
  "Standards",
  "Database",
  "Robotics",
  "Virtual Reality",
  "Extended Reality",
  "Augmented Reality",
  "Quantum",
  "IoT",
  "5G",
  "Space",
  "Cyberlaw",
  "Fintech",
  "Ecommerce",
  "Startups",
  "Privacy",
  "CloudSec",
  "DevOps",
  "Ethics",
  "Bioinformatics",
  "SmartCities",
  "Distributed",
  "Wearables",
  "Licensing",
  "Policy",
  "Sustainability",
  "High Performance Computing",
  "Visualization",
  "CloudInfra",
  "Automation",
  "Social",
  "Innovation",
  "Emerging Tech",
]

# Pre-compute embeddings for the categories to avoid re-computation
category_embeddings = model.encode(categories, convert_to_tensor=True)

# Lists to hold update operations
backend_updates = []
articles_updates = []

# Process each article in the backend collection
for article in backend_articles_collection.find():
    article_text = article.get("textContent", "")
    if not article_text or not article_text.strip():
        continue  # Skip if there's no text to process

    # Compute embedding for the article text
    text_embedding = model.encode(article_text, convert_to_tensor=True)
    
    # Calculate cosine similarities between the article text and category embeddings
    cosine_scores = util.cos_sim(text_embedding, category_embeddings)[0]
    
    # Retrieve the top 5 categories with the highest similarity scores
    top_results = torch.topk(cosine_scores, k=5)
    top_categories = [categories[idx.item()] for idx in top_results[1]]
    
    # Print the top categories and their scores for debugging
    print("Top 5 relevant categories for article '{}':".format(article.get("title", "No Title")))
    for score, idx in zip(top_results[0], top_results[1]):
        print("  {}: {:.4f}".format(categories[idx.item()], score.item()))
    
    # Create update operations for the backend article and corresponding user articles.
    backend_updates.append(
        UpdateOne({"_id": article["_id"]}, {"$set": {"tags": top_categories}})
    )
    
    # Assuming the link field in the backend article is "link" and user articles have "href"
    articles_updates.append(
        UpdateMany({"href": article["link"]}, {"$set": {"tags": top_categories}})
    )
    
    print("Storing update for article '{}' with tags: {}".format(article.get("title", "No Title"), top_categories))

# Execute bulk updates if there are any operations accumulated
if backend_updates:
    backend_result = backend_articles_collection.bulk_write(backend_updates)
    print("Backend articles bulk update result:", backend_result.bulk_api_result)

if articles_updates:
    articles_result = articles_collection.bulk_write(articles_updates)
    print("User articles bulk update result:", articles_result.bulk_api_result)

print("Processing complete.")