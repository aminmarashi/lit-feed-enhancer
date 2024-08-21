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
    self.vectorizers = [TfidfVectorizer(max_features=5000, ngram_range=(1, 3), sublinear_tf=True) for _ in range(max_len)]
    
    for i in range(max_len):
      tag_texts = [tags[i] if i < len(tags) and isinstance(tags[i], str) else '' for tags in X]
      self.vectorizers[i].fit(tag_texts)
    
    return self

  def transform(self, X, y=None):
    # Ensure X is a list of lists
    X = [tags if isinstance(tags, (list, np.ndarray)) else [] for tags in X]
    max_len = len(self.vectorizers)
    transformed = []
    
    for tags in X:
      tag_vectors = []
      for i in range(max_len):
        if i < len(tags) and isinstance(tags[i], str):
          tag_vector = self.vectorizers[i].transform([tags[i]]).toarray()
        else:
          tag_vector = np.zeros((1, len(self.vectorizers[i].get_feature_names_out())))
        tag_vectors.append(tag_vector)
      
      # If no valid tags are present, return a zero vector with at least one feature
      if len(tag_vectors) > 0:
        transformed.append(np.hstack(tag_vectors))
      else:
        # Handle the case where tag_vectors is empty by adding a dummy feature
        transformed.append(np.zeros((1, max(1, len(self.vectorizers)))))
    
    return np.array(transformed).reshape(len(X), -1)
