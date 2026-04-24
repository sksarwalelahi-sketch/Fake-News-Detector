from flask import Flask
from flask_cors import CORS
import signal
from functools import wraps

from backend_api.routes.api import api_bp


def timeout_handler(signum, frame):
    raise TimeoutError("Request exceeded time limit")


def request_timeout(seconds):
    """Decorator to enforce request timeout"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(seconds)
            try:
                result = func(*args, **kwargs)
            finally:
                signal.alarm(0)
            return result
        return wrapper
    return decorator


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(api_bp)
    
    # Set request timeout to 40 seconds for all requests
    app.config['REQUEST_TIMEOUT'] = 40
    
    return app
