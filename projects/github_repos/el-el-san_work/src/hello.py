"""
This script prints the classic "Hello, World!" message to the console.
It serves as a basic example of a Python script.
"""

def main():
    """
    Main function to execute the core logic of the script.
    Prints "Hello, World!" and includes basic error handling
    for robustness, although unlikely to be necessary for this simple operation.
    """
    try:
        # Print the greeting message
        print("Hello, World!")
    except Exception as e:
        # Basic error handling: Catch any unexpected exceptions
        # that might occur during the print operation.
        # For a simple print statement, this is highly improbable.
        print(f"An unexpected error occurred while printing: {e}")

if __name__ == "__main__":
    # This block ensures that the main() function is called
    # only when the script is executed directly (not imported as a module).
    main()