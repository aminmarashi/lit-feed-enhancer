# custom_transformers.py
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np

class OrderedTagVectorizer(BaseEstimator, TransformerMixin):
  def __init__(self):
    self.vectorizers = []

  def fit(self, X, y=None):
    # Ensure X is a list of lists
    X = [tags if isinstance(tags, (list, np.ndarray)) else [] for tags in X]
    max_len = max(len(tags) for tags in X)
    self.vectorizers = []

    for i in range(max_len):
      tag_texts = [tags[i] if i < len(tags) and isinstance(tags[i], str) else '' for tags in X]
      # Skip fitting if tag_texts is empty or contains only empty strings
      if not any(tag_texts):
        print(f"Skipping vectorizer for tag position {i} due to lack of valid data")
        self.vectorizers.append(None)
      else:
        vectorizer = TfidfVectorizer(max_features=5000, ngram_range=(1, 3), sublinear_tf=True)
        vectorizer.fit(tag_texts)
        self.vectorizers.append(vectorizer)
        
    return self

  def transform(self, X, y=None):
    # Ensure X is a list of lists
    X = [tags if isinstance(tags, (list, np.ndarray)) else [] for tags in X]
    max_len = len(self.vectorizers)
    transformed = []
    
    for tags in X:
      tag_vectors = []
      for i in range(max_len):
        if i < len(tags) and isinstance(tags[i], str) and self.vectorizers[i] is not None:
          tag_vector = self.vectorizers[i].transform([tags[i]]).toarray()
        elif self.vectorizers[i] is not None:
          tag_vector = np.zeros((1, len(self.vectorizers[i].get_feature_names_out())))
        else:
          tag_vector = np.zeros((1, 1)) # Minimal vector when vectorizer is None
        tag_vectors.append(tag_vector)
      
      if tag_vectors:
        transformed.append(np.hstack(tag_vectors))
      else:
        # Handle the case where no tag_vectors were created by adding a dummy feature
        transformed.append(np.zeros((1, max(1, len(self.vectorizers)))))
    
    return np.array(transformed).reshape(len(X), -1)