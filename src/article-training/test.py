#! /usr/bin/env python3
import pandas as pd
import joblib
import json

# Step 1: Load the model and the vectorizer
pipeline_filename = 'complete_pipeline.joblib'
pipeline = joblib.load(pipeline_filename)

def lambda_handler(event, context):
  all_data = event['data']

  # Take one random item from data
  data = all_data.sample(1)

  data['textcontent'] = data['textcontent'].fillna('').astype(str)
  data['tags'] = data['tags'].fillna('').astype(str)
  data['summary'] = data['summary'].fillna('').astype(str)
  data['title'] = data['title'].fillna('').astype(str)

  predictions = pipeline.predict(data)

  probabilities = pipeline.predict_proba(data)
  # Save probabilities as a JSON file
  with open('probabilities.json', 'w') as f:
    probabilities_dict = probabilities.tolist()
    probabilities_with_link_and_title = []
    for i, prob in enumerate(probabilities_dict):
      print({
        'link': data.iloc[i]['link'],
        'title': data.iloc[i]['title'],
        'probability': prob[2]
      })
      probabilities_with_link_and_title.append({
        'link': data.iloc[i]['link'],
        'title': data.iloc[i]['title'],
        'probability': prob[2]
      })
    f.write(json.dumps(probabilities_with_link_and_title))
  print(f"Probabilities saved to probabilities.json, {len(probabilities_with_link_and_title)} articles with probability > 0.85")
  return probabilities_with_link_and_title
if __name__ == "__main__":
  data = pd.read_csv("./new-articles.csv")
  lambda_handler({'data': data}, None)